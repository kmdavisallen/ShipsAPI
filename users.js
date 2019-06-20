/************************************************************************
 * Author: Kevin Allen
 * Date 5/30/19
 * Class CS493
 * Assignment: Final Project, user routes
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
const model = {'username':null, 'email':null, 'authKey':null};

//convert from datastore format to JSON
function fromDatastore(obj){
    obj.id = obj[Datastore.KEY].id;
    return obj;
}

//add user to database
async function createUser(username, email, authKey){
    let key = datastore.key(['user', authKey]);
    const newUser = {'username':username, 'email':email, 'authKey':authKey};
    await datastore.insert({'key':key, 'data':newUser});
    return key;
}

//view ships created by admiral
async function viewShipsAdmiral(kind, admiral){
    const query = datastore.createQuery(kind).filter('admiral', '=', admiral);
    let [results] = await datastore.runQuery(query);
    return results.map(fromDatastore);
}
//remove user from database
async function deleteUser(id){
    const key = await datastore.key(['user', id]);
    if(key){
        return datastore.delete(key);
    }
}

/**************************** User routes ****************************/
//route to sign up new users
router.post('/', (req, res) =>{
    if(!req.body.email || !req.body.password || !req.body.username){
        res.status(400).send("Must supply username, email, and password");
    }
    else{
        let token = 'empty';
        //get auth0 token for managment api usage
        let options = {
            method: "POST",
            url: 'https://dev-brvqpych.auth0.com/oauth/token',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            form: 
            { grant_type: 'client_credentials',
              client_id: 'bL65lYgbmBIQATxaIkxwcleGLbCB7Vh8',
              client_secret: 'c5bRFjEgdDP0ckPcUfk5bxmrnhJ4Mz38mMuKzYtbYOlnq_T3Sh7tNc0MwMzA8stT',
              audience: 'https://dev-brvqpych.auth0.com/api/v2/' }
        }
        request(options, (err, response, body) =>{
            if(err){
                res.status(500).send(err);
            }
            else{
                let bodyParsed = JSON.parse(body);
                
                token = bodyParsed.access_token;
                //send post to Auth0 to insert new user
                options = {
                    method: 'POST',
                    url: 'https://dev-brvqpych.auth0.com/api/v2/users',
                    headers: {
                        authorization: 'Bearer ' + token,
                        'content-type': "application/json"
                    },
                    body: {
                        connection: 'Username-Password-Authentication',
                        username: req.body.username,
                        email: req.body.email,
                        password: req.body.password,
                    },
                    json: true
                };
                request(options, (err, response, body) => {
                    if(err){
                        res.status(500).send(error);
                    }
                    else{
                        //add user to database
                        createUser(req.body.username, req.body.email, body.user_id);
                        res.status(201).send(body);
                    }
                });
            }
        });
    }
})

// route for deleting users, cleanup for testing only !!!!!!!!!!!!!!!!!!!!!!!
router.delete('/:id', (req, res) =>{
    let token = 'empty';
    //get auth0 token for managment api usage
    let options = {
        method: "POST",
        url: 'https://dev-brvqpych.auth0.com/oauth/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        form: 
        { grant_type: 'client_credentials',
          client_id: 'bL65lYgbmBIQATxaIkxwcleGLbCB7Vh8',
          client_secret: 'c5bRFjEgdDP0ckPcUfk5bxmrnhJ4Mz38mMuKzYtbYOlnq_T3Sh7tNc0MwMzA8stT',
          audience: 'https://dev-brvqpych.auth0.com/api/v2/' }
    }
    request(options, (err, response, body) =>{
        if(err){
            res.status(500).send(err);
        }
        else{
            let bodyParsed = JSON.parse(body);        
            token = bodyParsed.access_token;
            //send post to Auth0 to delete user
            options = {
                method: 'DELETE',
                url: 'https://dev-brvqpych.auth0.com/api/v2/users/' + req.params.id,
                headers: {
                    authorization: 'Bearer ' + token,
                    'content-type': "application/json"
                },
                body: {},
                json: true
            };
            request(options, (err, response, body) => {
                if(err){
                    res.status(500).send(error);
                }
                else{
                    deleteUser(req.params.id);
                    res.status(204).send(body);
                }
            });
        }
    });
});

//route for login
router.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    let options = {
        method: 'POST',
        url: 'https://dev-brvqpych.auth0.com/oauth/token',
        headers: {'content-type': "application/json"},
        body: {
            grant_type: 'password',
            username: username,
            password: password,
            client_id: 'bL65lYgbmBIQATxaIkxwcleGLbCB7Vh8',
            client_secret: 'c5bRFjEgdDP0ckPcUfk5bxmrnhJ4Mz38mMuKzYtbYOlnq_T3Sh7tNc0MwMzA8stT'
        },
        json: true
    };
    request(options, (err, response, body) => {
        if(err){
            res.status(500).send(error);
        }
        else{
            let id = {};
            id.token = body.id_token;
            res.status(200).json(id);
        }
    });
});

//get ships that belong to a selected user/admiral
router.get('/:id/ships', checkJwt, (req, res) => {
    //check accept header, reject anything but JSON
    const accept = req.accepts('application/json');
    if(!accept){
        res.status(406).send("returns JSON only");
    }
    else if(req.user.sub !== req.params.id){
        res.status(403).send('Forbidden');
    }
    else{
        let admiral = req.user.sub;
        viewShipsAdmiral('ship', req.params.id).then((results) => {
            results.forEach((result) => {
                result.self = req.protocol + '://' + req.headers.host + '/ships/' + result.id;
            });
            res.status(200).json(results);
        })
    }

});

//405 for puts/patchs/deletes to root
router.all('/', (req,res) => {
    res.status(405).set('Accept', 'POST').end();
});

module.exports = router;