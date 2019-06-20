/************************************************************************
 * Author: Kevin Allen
 * Date 5/30/19
 * Class CS493
 * Assignment: Final Project
 ************************************************************************/
//express setup
const express = require('express');
const app = express();

//body parser setup
const bodyParser = require('body-parser');
app.use(bodyParser.json());

app.use('/users', require('./users.js'));
app.use('/ships', require('./ships.js'));
app.use('/crew', require('./crew.js'));

app.all('*', (req,res) =>{
    res.status(404).send("Resource not found")
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>{
    console.log(`App listening on port ${PORT}`);
    console.log('Press Ctrl+C to quit');
});
 