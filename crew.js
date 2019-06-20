/************************************************************************
 * Author: Kevin Allen
 * Date 5/30/19
 * Class CS493
 * Assignment: Final project, crew routes
 ************************************************************************/
const express = require('express');
const router = express.Router();

const project = 'ka493final'; //project ID or number?
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
const model = {"name":null, "rank":null, "speciality":null, "ship":{}};

//convert from datastore format to JSON
function fromDatastore(obj){
    obj.id = obj[Datastore.KEY].id;
    return obj;
}

//page through crew
async function pageAll(kind, cursor){
    let query = datastore.createQuery(kind).limit(5);
    if(cursor){
        query = query.start(cursor);
    }
    let entities = {};
    let results = await datastore.runQuery(query);
    entities.items = results[0].map(fromDatastore);
    if(results[1].moreResults !== Datastore.NO_MORE_RESULTS){
        entities.next = '?cursor=' + results[1].endCursor;
    }
    //run stat query for total number of entities
    let statQuery = datastore.createQuery('crew').select('__key__');
    let [stats] = await datastore.runQuery(statQuery);
    entities.total = (stats.length);
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

//data check for making edits, uses data model for comparsion 
function dataCheck(model, data){
    let flag = true;
    let modelKeys = Object.keys(model).sort();
    let dataKeys = Object.keys(data).sort();
    for(let i =0; i < dataKeys.length; i++){
        if(!modelKeys.includes(dataKeys[i])){
            flag = false;
        }
    }
    return flag;
}

//data check for creatoion
function strictCheck(model, data){
    let modelKeys = Object.keys(model).sort();
    let dataKeys = Object.keys(data).sort();
    return JSON.stringify(modelKeys) === JSON.stringify(dataKeys);
}

//create crew member
async function createCrew(name, rank, speciality){
    let key = datastore.key('crew');
    const newCrew = {"name": name, "rank":rank, "speciality":speciality, "ship":{}};
    await datastore.insert({ "key": key, "data": newCrew });
    return key;
}

//edit crew
async function editCrew(id, name, rank, speciality, ship_id){
    //get old data
    let entity = await viewOne('crew', id);
    //swap values
    if(name){
        entity[0].name = name;
    }
    if(rank){
        entity[0].rank = rank;
    }
    if(speciality){
        entity[0].speciality = speciality;
    }
    if(ship_id){
        //check if crew belongs to a ship already
        if(entity[0].ship.id){
            return null;
        }
        let newShip = await viewOne('ship', ship_id);
        
        //update crew member
        entity[0].ship.id = ship_id;
        entity[0].ship.name = newShip[0].name;
        //update ship
        newShip[0].crew.push({'id':entity[0].id});
        await datastore.update(newShip);
    }
    return await datastore.update(entity); 
}

//delete crew member
async function deleteOne(id){
    const dsKey = await datastore.key(['crew', parseInt(id, 10)]);
    let results = await datastore.get(dsKey);
    results = results.map(fromDatastore);
    if(!results[0]){
        return 1;
    }
    else if(results[0].ship.id){
        return 2;
    }
    else{
        await datastore.delete(dsKey);
        return 0;
    } 
}

/*******************************Routers ****************************************/
//view all crew members
router.get('/', (req, res) => {
    //check accept header, reject anything but JSON
    const accept = req.accepts('application/json');
    if(!accept){
        res.status(406).send("returns JSON only");
    }
    else{
        let cursor = req.query.cursor;
        pageAll('crew', cursor).then((results)=>{
            results.items.forEach((result)=>{
                result.self = req.protocol + '://' + req.headers.host + '/crew/' + result.id;
                if(result.ship.id){
                    result.ship.self = req.protocol + '://' + req.headers.host + '/ships/' + result.ship.id;
                }
            });
            if(results.next){
                results.next = req.protocol + '://' + req.headers.host + '/crew' + results.next;
            }
            res.status(200).json(results)});
    }
});

//view a single crew member
router.get('/:id', (req, res) => {
    //check accept header, reject anything but html & JSON
    const accept = req.accepts('application/json');
    if(!accept){
        res.status(406).send("returns JSON");
    }
    else{
        viewOne('crew', req.params.id).then((results) =>{
            if(results){
                //add url in
                results[0].self = req.protocol + '://' + req.headers.host + '/crew/' + results[0].id;
                if(results[0].ship.id){
                        results[0].ship.self = req.protocol + '://' + req.headers.host + '//' + results[0].ship.id;
                }
                res.status(200).json(results);      
            }
            else{
                res.status(404).send("Crew member not found");
            }
        });
    }
});

//create crew members
router.post('/', (req, res) => {
    //check content-type header, reject anything but JSON
    if(req.is('application/json')){
        req.body.ship ={};
        let data = req.body;
        if(strictCheck(model, data)){
            createCrew(req.body.name, req.body.rank, req.body.speciality).then((key) =>{
                res.status(201).send('{"id": ' + key.id + ' }')
            });
        }
        else{
            res.status(400).send('Incorrect syntax for creating crew members');
        }
    }
    else{
        res.status(415).send('only accepts JSON');
    } 
});

//modify crew
router.put('/:id', async function(req, res){
    //check accept header, reject anything but JSON
    if(!req.is('application/json')){
        res.status(415).send("only accepts JSON");
    }
    else{
        if(!dataCheck(model, req.body)){
            res.status(400).send("Incorrect systax for editing crew member");
        }
        else if(editCrew(req.params.id, req.body.name, req.body.rank, req.body.speciality, req.body.ship)){
            res.status(303).set('Location', req.protocol + '://' + req.headers.host + '/crew/' + req.params.id).end();
        }
        else{
            res.status(403).send('Forbidden, crew member already assigned to ship');
        }
    }
    
});

//delete crew
router.delete('/:id', async function(req, res){
    
    let results = await deleteOne(req.params.id);
    if(results === 0){
        res.status(204).end();
    }
    else if(results ===1){
        res.status(404).send("Cargo not found");
    }
    else if(results === 2){
        res.status(403).send("Forbidden, crew member aboard a ship");
    } 
}); 

//405 for puts/patchs/deletes to root
router.all('/', (req,res) => {
    res.status(405).set('Accept', 'GET, POST').end();
});

module.exports = router;