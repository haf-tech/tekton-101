/* ******************************
 * Tekton 101
 *
 * Simple nodejs app with some REST endpoints
 * ******************************
*/


const app = require('express')()

app.set('port', (process.env.PORT || 5000))
//app.use(express.static(__dirname + '/public'))


app.get('/', (req, res) => {
  res.send("Hello from NodeJS Playground!");
});
 
/*
const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

app.get('/echo/:val', (req, res) => {
  let val = req.params.val;

  let delay = Math.floor(1000 * (Math.random() * 5)); 
  sleep(delay).then(() => {
    res.send("Echo: " + val + "; delay=" + delay);
  })
  
});
*/

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})

module.exports.app = app;