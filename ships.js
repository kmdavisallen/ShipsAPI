/************************************************************************
 * Author: Kevin Allen
 * Date 5/30/19
 * Class CS493
 * Assignment: Final Project, ship routes
 ************************************************************************/
const express = require('express');
const router = express.Router();

const project = 'ka493final'; //project ID
const {Datastore} = require('@google-cloud/datastore');
const datastore = new Datastore({projectID:project});

/*********************************** JWT setup *****************************/
//request setup to send request from server
const request = require('request');

//jwt packages
const jwt = require('express-jwt');
const jwksRSA = require('jwks-rsa');

//check the token middleware
const checkJwt = jwt({
    secret: jwksRSA.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: 'https://dev-brvqpych.auth0.com/.well-known/jwks.json'  // change localhost
    }),
    issuer: 'https://dev-brvqpych.auth0.com/',            //change localhost
    algorithms: ['RS256']
});
/************************* datastore functions *******************************/

//define data model
const model = {"name":null, "mission":null, "max_crew":null, "crew":[], "admiral":null};

//convert from datastore format to JSON
function fromDatastore(obj){
    obj.id = obj[Datastore.KEY].id;
    return obj;
}

//get all
async function getNames(kind){
    let query = datastore.createQuery(kind);
    let [results] = await datastore.runQuery(query);
    return results.map(fromDatastore);
}

//page through ships
async function pageAll(kind, cursor){
    let query = datastore.createQuery(kind).limit(5);
    if(cursor){
        query = query.start(cursor);
    }
    let entities = {};
    let results = await datastore.runQuery(query);
    //log the results check info for total number
    
    entities.items = results[0].map(fromDatastore);
    if(results[1].moreResults !== Datastore.NO_MORE_RESULTS){
        entities.next = '?cursor=' + results[1].endCursor;
    }
    //run stat query for total number of entities
    let statQuery = datastore.createQuery('ship').select('__key__');
    let [stats] = await datastore.runQuery(statQuery);
    entities.total = (stats.length);
    return entities;
}

//page through crew on a ship
async function crewPageAll(kind, id, cursor){
    let query = datastore.createQuery(kind).filter("ship.id", "=", id).limit(5);
    if(cursor){
        query = query.start(cursor);
    }
    let entities = {};
    let results = await datastore.runQuery(query);
    entities.items = results[0].map(fromDatastore);
    if(results[1].moreResults !== Datastore.NO_MORE_RESULTS){
        entities.next = '?cursor=' + results[1].endCursor;
    }
    return entities;
}

//get one
async function viewOne(kind, id){
    const dsKey = await datastore.key([kind, parseInt(id, 10)]);
    let results = await datastore.get(dsKey);
    if(!results[0]){
        return null;
    }
    else{
        return results.map(fromDatastore);
    }
    
}

//delete a ship
async function deleteOne(id){
    const dsKey = await datastore.key(['ship', parseInt(id, 10)]);
    let results = await datastore.get(dsKey);
    if(!results[0]){
        return null
    }
    else{
        // reassign each crew member
        let crewUpdate = [];
        for(memberId of results[0].crew){
            let crewKey = await datastore.key(['crew', parseInt(memberId.id)]);
            //console.log(crewKey);
            let member = await viewOne('crew', memberId.id);
            member[0].ship.id = null;
            member[0].ship.name = null;
            let memUp = {'key':crewKey, 'data':member[0]};
            crewUpdate.push(memUp);        //////////////////////////////check if viewOne returns key
        }
        //console.log(crewUpdate);
        await datastore.update(crewUpdate);  
        return await datastore.delete(dsKey);
    }
    
}

//create a ship
async function createShip(name, mission, max_crew, admiral){
    let key = datastore.key('ship');
    const newShip = {"name": name, "mission":mission, "max_crew":max_crew, "crew":[], "admiral":admiral};
    await datastore.insert({ "key": key, "data": newShip });
    return key;
}

//edit a ship
async function editShip(id, name, mission, max_crew, crew, admiral){
    //get the old data
    let entity = await viewOne('ship', id);
    if(!entity){
        return null;
    }
    //compare new values and repace non-null values
    if(name){
        entity[0].name = name;  //change name
        //change name of ship on crew records
        for(let i =0; i < entity[0].crew.length; i++ ){
            let member = await viewOne('crew', entity[0].crew[i].id);
            member[0].ship.name = name;
            //if crew member is to be removed
            if(crew.remove.includes(parseInt(entity[0].crew[i].id))){
                //update crew member
                member[0].ship.name = null;
                member[0].ship.id = null;
                //update ship roster
                entity[0].crew.splice(i, 1);
                console.log(entity[0].crew);
            }
            await datastore.update(member);
        }    
    }
    if(crew.add){
        let roster =[];
        for(member of crew.add){
            let key = await datastore.key(['crew', parseInt(member)]);
            let results = await viewOne('crew', member);
            if(results[0].ship.id){ 
                return null;        //crew member already assigned to another ship
            }
            else{
                results[0].ship.name = entity[0].name;
                results[0].ship.id = entity[0].id;
                let finalMember = {'key':key, 'data':results[0]};
                roster.push(finalMember);
                entity[0].crew.push({'id':results[0].id});
            }
        }
        await datastore.update(roster);
    }
    if(mission){
        entity[0].mission = mission;
    }
    if(max_crew){
        entity[0].max_crew = max_crew;
    }
    if(admiral){
        entity[0].admiral = admiral;
    }    
    //update the entity in datastore
    
    await datastore.update(entity);
    return id;
}

//unique check, bool return false if match is found
async function isUnique(name, id){    //pass in id# if there is one
    let flag = true;
    results = await getNames('ship');
    if(id){
        results.forEach((result)=>{
            if(result.name === name && result.id !== id){
                flag = false;
            }
        });
    }
    else{
        results.forEach((result)=>{
            if(result.name === name){ 
                flag = false;
            }
        });
    }
    return flag;
}

//data check, uses data model for comparsion for editing 
function dataCheck(model, data){
    let flag = true;
    modelKeys = Object.keys(model).sort();
    dataKeys = Object.keys(data).sort();
    for(let i =0; i < dataKeys.length; i++){
        if(!modelKeys.includes(dataKeys[i])){
            flag = false;
        }
    }
    return flag;
}
//data check for ship creation
function strictCheck(model, data){
    let modelKeys = Object.keys(model).sort();
    let dataKeys = Object.keys(data).sort();
    return JSON.stringify(modelKeys) === JSON.stringify(dataKeys);
}

//load crew members onto ship
async function crewToShip(ship_id, crew_id){
    let ship = await viewOne('ship', ship_id);
    let crew = await viewOne('crew', crew_id);
    if(!ship[0]){
        return 1; //bad boat id
    }
    if(!crew[0]){
        return 2; //bad crew id
    }
    if(crew[0].ship.id){
        return 3; //already on another ship
    }
    else{
        crew[0].ship.id = ship[0].id;
        crew[0].ship.name = ship[0].name;
        ship[0].crew.push({'id':crew[0].id});
        await datastore.update(crew);
        await datastore.update(ship);
        return 0;
    }
}

//load crew members onto ship
async function crewOffShip(ship_id, crew_id){
    let ship = await viewOne('ship', ship_id);
    let crew = await viewOne('crew', crew_id);
    if(!ship[0]){
        return 1; //bad boat id
    }
    if(!crew[0]){
        return 2; //bad crew id
    }
    if(crew[0].ship.id !== ship[0].id){
        return 3; //crew member not on this ship
    }
    else{
        crew[0].ship.id = null;
        crew[0].ship.name = null;
        let index =0;
        for(index; index < ship[0].crew.length; index++){
            if(ship[0].crew[index].id === crew[0].id){
                break;
            }
        }
        ship[0].crew.splice(index, 1);
        await datastore.update(crew);
        await datastore.update(ship);
        return 0;
    }
}

/*******************************Routers ****************************************/
//view all ships
router.get('/', (req, res) => {
    //check accept header, reject anything but JSON
    const accept = req.accepts('application/json');
    if(!accept){
        res.status(406).send("returns JSON only");
    }
    else{
        let cursor = req.query.cursor;
        pageAll('ship', cursor).then((results)=>{
            results.items.forEach((result)=>{
                result.self = req.protocol + '://' + req.headers.host + '/ships/' + result.id;
                if(result.crew){
                    result.crew.forEach((item) => {
                        item.self = req.protocol + '://' + req.headers.host + '/crew/' + item.id;
                    })
                }
            });
            if(results.next){
                results.next = req.protocol + '://' + req.headers.host + '/ships' + results.next;
            }
            res.status(200).json(results)});
    }
});

//view all crew aboard a given ship
router.get('/:id/crew', async function(req, res){
    //check accept header, reject anything but html & JSON
    const accept = req.accepts('application/json');
    if(!accept){
        res.status(406).send("returns JSON");
    }
    else{
        let ship = await viewOne('ship', req.params.id);
        if(!ship[0]){
            res.status(404).send('Ship not found');
        }
        else{
            let crewRoster = await crewPageAll('crew', req.params.id, req.query.cursor);
            crewRoster.items.forEach((member)=>{
                member.self = req.protocol + '://' + req.headers.host + '/crew/' + member.id;
                if(member.ship.id){
                    member.ship.self = req.protocol + '://' + req.headers.host + '/ships/' + member.ship.id;
                } 
            });
            if(crewRoster.next){
                crewRoster.next = req.protocol + '://' + req.headers.host + '/ships/' + req.params.id + '/crew' + crewRoster.next;
            }
            res.status(200).json(crewRoster);
        }
    }
});

//view a ship
router.get('/:id', (req, res) => {
    //check accept header, reject anything but JSON
    const accept = req.accepts('application/json');
    if(!accept){
        res.status(406).send("returns JSON");
    }
    else{
        viewOne('ship', req.params.id).then((results) =>{
            if(results){
                //add url in
                results[0].self = req.protocol + '://' + req.headers.host + '/ships/' + results[0].id;
                if(results[0].crew){
                    results[0].crew.forEach((item) => {
                        item.self = req.protocol + '://' + req.headers.host + '/crew/' + item.id;
                    });
                }
                res.status(200).json(results);      
            }
            else{
                res.status(404).send("Ship not found");
            }
        });
    }
});

//add a ship
router.post('/', checkJwt, (req, res) => {
    //check content-type header, reject anything but JSON
    if(req.is('application/json')){
        if(!req.user.name){
            res.status(401).send("Unauthorized");
        }
        else{
            //add in empty crew and admiral for data check
            req.body.crew = [];
            req.body.admiral = "nobody";
            //enforce no extra data in body
            if(!strictCheck(model, req.body)){
                res.status(400).send('Incorrect syntax for creating ships, please see documentation');
            }
            //check for unique name and create ship
            else{
                isUnique(req.body.name).then((flag) =>{
                    if(flag){
                        createShip(req.body.name, req.body.mission, req.body.max_crew, req.user.sub).then( (key) =>{
                            res.status(201).send('{"id": '+ key.id + ' }')});
                    }
                    else{
                        res.status(400).send("Ship with that name already exist, please choose different name");
                    }
                });
            }
        }
    }
    else{
        res.status(415).send('only accepts JSON');
    } 
});

//modify a ship
router.put('/:id', checkJwt, async function(req, res){
    //check accept header, reject anything but JSON
    if(!req.is('application/json')){
        res.status(415).send("only accepts JSON");
    }
    else if(!req.user.name){
        res.status(401).send("Unauthorized")
    }
    else{
        let ship = await viewOne('ship', req.params.id);
        if(ship[0].admiral !== req.user.sub){
            res.status(403).send("Forbidden");
        }
        else{
            if(dataCheck(model, req.body)){
                let flag = await isUnique(req.body.name, req.params.id);
                if(flag){
                    let result = await editShip(req.params.id, req.body.name, req.body.mission, req.body.max_crew, req.body.crew);
                    if(result){
                        res.status(303).set('Location', req.protocol + '://' + req.headers.host + '/ships/' + req.params.id).end();
                    }
                    else{
                        res.status(404).send("ship not found");
                    }
                }
                else{
                    res.status(400).send('Ship with that name already exists, please choose different name');
                }
            }
            else{
                res.status(400).send('Incorrect syntax for editing ships, please see documentation');
            }
        }
    }
    

});

//add a crew member to a ship
router.put('/:ship_id/crew/:crew_id', checkJwt, async function(req, res){
    if(!req.user.sub){
        res.status(401).send("Unauthorized");
    }
    else{
        let ship = await viewOne('ship', req.params.ship_id);
        if(ship[0].admiral !== req.user.sub){
            res.status(403).send("Forbidden");
        }
        else{
            crewToShip(req.params.ship_id, req.params.crew_id).then((result) =>{
                if(result === 1){
                    res.status(404).send("Ship not found");
                }
                else if(result === 2){
                    res.status(404).send("Crew member not found");
                }
                else if(result === 3){
                    res.status(403).send("FORBIDDEN crew member on another ship");
                }
                else if(result === 0){
                    res.status(200).send("Crew loaded sucessfully");
                }
                else{
                    res.status(400).send("I don't know what happened, but its bad");
                }   
            })
        }
    }
})

//remove a crew member from a ship
router.delete('/:ship_id/crew/:crew_id', checkJwt, async function(req, res){
    if(!req.user.sub){
        res.status(401).send("Unathorized");
    }
    else{
        let ship = await viewOne('ship', req.params.ship_id);
        if(ship[0].admiral !== req.user.sub){
            res.status(403).send("Forbidden");
        }
        else{
            crewOffShip(req.params.ship_id, req.params.crew_id).then((result) =>{
                if(result === 1){
                    res.status(404).send("Ship not found");
                }
                else if(result === 2){
                    res.status(404).send("Crew member not found");
                }
                else if(result === 3){
                    res.status(403).send("FORBIDDEN crew member on another ship");
                }
                else if(result === 0){
                    res.status(200).send("Crew unloaded sucessfully");
                }
                else{
                    res.status(400).send("I don't know what happened, but its bad");
                }   
            })
        }
    }
})

//delete a ship
router.delete('/:id', checkJwt, async function(req, res){
    if(!req.user.sub){
        res.status(401).send("Unathorized");
    }
    else{
        let ship = await viewOne('ship', req.params.id);
        if(ship[0].admiral !== req.user.sub){
            res.status(403).send("Forbidden");
        }
        else{
            let results = await deleteOne(req.params.id);
            if(results){
                res.status(204).end();
            }
            else{
                res.status(404).send("Ship not found");
            }
        }
    }
});

//405 for puts/patchs/deletes to root
router.all('/', (req,res) => {
    res.status(405).set('Accept', 'GET, POST').end();
});

module.exports = router;