/* ******************************
 * Tekton 101
 *
 * Simple nodejs app with some REST endpoints
 * - / main page, calls a backend service if defined
 * - /metrics Prometheus endpoint
 * 
 * Supported ENV
 * TEKTON_101_ENV_NAME
 * app name, default 'TEKTON_101'. Will be also used as ServiceName for Jaeger/OpenTracing.
 * Only alphanum is allowed, no whitespace or special chars.
 * 
 * TEKTON_101_ENV_EXAMPLE
 * holds any kind of value and will be displayed in / endpoint
 * 
 * TEKTON_101_ENV_DELAY
 * in milliseconds, default 1.000, to delay the processing
 * 
 * TEKTON_101_ENV_BACKEND_SERVICE
 * Complete URL to a backend service which will be called via HTTP GET 
 * and response will be added to the output of /. Default null, no backend service call.
 * 
 * TEKTON_101_ENV_BACKEND_SERVICE_DELAY
 * in milliseconds, default 0, to delay the backend service call
 * 
 * TEKTON_101_ENV_TRACING_ENABLED
 * Default false. Enable OpenTracing or not.
 * 
 * SVC_LANGUAGE_TRANSLATOR_URL
 * SVC_LANGUAGE_TRANSLATOR_APIKEY
 * URL and API for Language Translator service
 * HTTP GET /translate/:lang/:text
 * if the env vars are empty the endpoint will cancel the processing with a error message
 * 
 * Integrated libs
 * - Prometheus
 * - Jaeger for OpenTracing (linked to Prometheus)
 * 
 * Idea
 * Create with this app a chain of relationships between the apps. Any new app could have use a previous started
 * version of the app as backend service. 
 * Very simple way to test and verify OpenTracing and work with Microservices aspects.
 * 
 * 
 * Usage
 * $ npm start
 * Without additional backend service
 * 
 * $ TEKTON_101_ENV_BACKEND_SERVICE=http://127.0.0.1:5001 TEKTON_101_ENV_DELAY=2000 TEKTON_101_ENV_BACKEND_SERVICE_DELAY=0 npm start
 * With a backend service and some delays
 * ******************************
 * 
*/

const promClient = require('prom-client');
const promBundle = require("express-prom-bundle");
const app = require('express')()
const axios = require('axios');
const util = require('util');

// ############# Prometheus 
// include HTTP method and URL path into the labels
const metricsMiddleware = promBundle({includeMethod: true, includePath: true});

app.use(metricsMiddleware);


const counterUserAgent = new promClient.Counter({name: 'http_request_tekton101_user_agent_total', help: 'Tekton101: User Agents', labelNames: ['ua']});
const counterTranslations = new promClient.Counter({name: 'http_request_tekton101_translations_total', help: 'Tekton101: Language Translation requests', labelNames: ['lang']});


// ############# Application configuration
app.set('port', (process.env.PORT || 5000))
app.set('ip', (process.env.IP || '0.0.0.0'))

app.set('envTektonName', (process.env.TEKTON_101_ENV_NAME || 'TEKTON_101'))

app.set('envTektonExample', (process.env.TEKTON_101_ENV_EXAMPLE || 'default value'))

app.set('envDelay', (process.env.TEKTON_101_ENV_DELAY || 1000))

app.set('envBackendService', (process.env.TEKTON_101_ENV_BACKEND_SERVICE || ''))

app.set('envBackendServiceDelay', (process.env.TEKTON_101_ENV_BACKEND_SERVICE_DELAY || 0))

app.set('envTracingEnabled', (process.env.TEKTON_101_ENV_TRACING_ENABLED || false))

// ############# Jaeger configuration
if(app.get('envTracingEnabled')) {

  const jaeger = require('jaeger-client');
  const jaegerInitTracer = jaeger.initTracer;
  var PrometheusMetricsFactory = jaeger.PrometheusMetricsFactory;

  var appName = app.get('envTektonName');
  var config = {
    serviceName: app.get('envTektonName'),
  };
  var metrics = new PrometheusMetricsFactory(promClient, config.serviceName);
  var options = {
    tags: {
      'tekton101.version': process.env.npm_package_version,
    },
    metrics: metrics
  };

  console.log('tracing enabled, initializing...')
  var tracer = jaeger.initTracerFromEnv(config, options);
}


// ############# Entry points
// ## Default page, displays all request headers, and the result of the backend service if configured
app.get('/', (req, res) => {
  
  //var ret = "[" + app.get('envTektonName') + "]: Hello from NodeJS Playground! TEKTON_101_ENV_EXAMPLE=" + app.get('envTektonExample');
  var ret = util.format("[%s]: Hello from NodeJS Playground! TEKTON_101_ENV_EXAMPLE=%s\n\n", app.get('envTektonName'), app.get('envTektonExample'));
  var userAgent = req.get('User-Agent');
  console.log('user-agent: ' + userAgent);

  // Prometheus Metric: inc and set the user agent
  counterUserAgent.labels(userAgent).inc();

  // append some env vars
  ret += "Environment variables:\n";
  ret += util.format("%s=%s\n", "HOSTNAME", (process.env.HOSTNAME || 'localhost'));

  // append all headers
  ret += "\n\nRequest Headers:\n";
  for (const headerName in req.headers) {
    
    const headerValue = req.headers[headerName];
    ret += util.format("%s=%s\n", headerName.toUpperCase(), headerValue);    
  }


  // simulated processing
  var processDelay = app.get('envDelay');
  sleep(processDelay).then(() => {
    
    ret = callBackendService(ret, req, res);
  });
  
});

// ## Translate
app.get('/translate/:lang/:txt', (req, res) => {
  
  var targetLanguge = req.params.lang;
  var textToTranslate = req.params.txt;
  var returnData = "";

  if(!process.env.SVC_LANGUAGE_TRANSLATOR_URL || !process.env.SVC_LANGUAGE_TRANSLATOR_APIKEY) {
    console.log('translate: no backend service URL and/or API key set. Cancel processing here. Return dummy response');
    res.send({"translations":[],"word_count":0,"character_count":0,"message":"No backend service defined"});
    return;
  }

  
  var url = process.env.SVC_LANGUAGE_TRANSLATOR_URL;
  var userId = "apikey";
  var passwd = process.env.SVC_LANGUAGE_TRANSLATOR_APIKEY;
  

  var userAgent = req.get('User-Agent');
  console.log('user-agent: ' + userAgent);

  // Prometheus Metric: inc and set the user agent
  counterUserAgent.labels(userAgent).inc();
  // Prometheus Metric: inc translation for given language
  counterTranslations.labels(targetLanguge).inc();

  let data = JSON.stringify({
    text: [textToTranslate], 
    target: targetLanguge
  })

  axios.interceptors.request.use(request => {
    console.log('Starting Request', JSON.stringify(request, null, 2))

    for (const headerName in request.headers) {
    
      const headerValue = request.headers[headerName];
      console.log( util.format("%s=%s", headerName.toUpperCase(), headerValue) );

    }
    return request
  })

  axios.post(url + "/v3/translate?version=2018-05-01", data, {
          auth: {
            username: userId,
            password: passwd
          },
          headers: {
            post: {
              'Content-Type': 'application/json'
            }
          }
        })
          .then(function (response) {
            console.log(response.status);
            returnData = response.data;              
          })
          .catch(function (error) {
            // handle error
            console.log(error.message);
            returnData = `TranslationService Failed: ${error.message}`;
          })
          .finally(function () {

            // send the response to the client
            res.send(returnData);
          });
  
});


// ## Memory use case
// For testing the memory consumption, make endless requests  to the endpoint
// waitSec=1; mId=0; function doCall() { id=$1; ret=$(curl -s http://127.0.0.1:5000/mem/consume); printf "...response (%d): %s\n" $id $ret }; while true; do sleep $waitSec; printf "%s: sending request (%d)...\n" "$(date)" $mId; (doCall $mId  &); mId=$((mId+1)); done
var memItemSize=10000;
var memSleep=20000
app.get('/mem/consume', (req, res) => {

  var memData = [];
  
  console.log('mem consume: consume memory...')
  for(i = 0; i < memItemSize; i++) {
    memData.push('memory test data: ' + new Date());
  }

  console.log('mem consume: sleep...')
  sleep(memSleep).then(() => {

    // process.memoryUsage()
    // provides info about memory usage
    // rss: Resident Set Size, total allocated mem usage
    // heapTotal: allocated heap
    // heapUsed: actual memory usage
    // external: mem of consumed JS engine
    var ret = {}
    ret.memoryUsage = process.memoryUsage();
    ret.memItemSize = memItemSize;
    ret.memSleepInMs = memSleep;
    ret.memNode = process.env.HOSTNAME;

    // clean up
    memData = undefined;

    console.log('mem consume: done. ', ret)
    res.send( ret );
  });

  
});


// ## CPU use case
// For testing the cpu consumption, make endless requests  to the endpoint
// waitSec=1; mId=0; function doCall() { id=$1; ret=$(curl -s http://127.0.0.1:5000/cpu/consume); printf "...response (%d): %s\n" $id $ret }; while true; do sleep $waitSec; printf "%s: sending request (%d)...\n" "$(date)" $mId; (doCall $mId  &); mId=$((mId+1)); done
var cpuItemSize=10000;
var cpuSleep=1
app.get('/cpu/consume', (req, res) => {

  
  console.log('cpu consume: consume cpu...')
  var x = 0.0001;
  for(i = 0; i < cpuItemSize; i++) {
    x=x+Math.sqrt(x);
  }

  console.log('cpu consume: sleep...')
  sleep(cpuSleep).then(() => {

    // process.cpuUsage()
    // provides info about cpu usage    
    var ret = {}
    ret.cpuUsage = process.cpuUsage();
    ret.cpuItemSize = cpuItemSize;
    ret.cpuSleepInMs = cpuSleep;
    ret.cpuNode = process.env.HOSTNAME;

    // clean up
    x = undefined;

    console.log('cpu consume: done. ', ret)
    res.send( ret );
  });  
});

// ############# Utilities
const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

function callBackendService(ret, req, res) {
  
  var backendService = app.get('envBackendService');
  if (typeof backendService !== 'undefined' && backendService !== null && backendService !== '') {
    // wait before calling backend service
    var backendServiceDelay = app.get('envBackendServiceDelay');
    sleep(backendServiceDelay).then(() => {
  
      axios.get(backendService)
            .then(function (response) {
              console.log(response.status);
              ret = `${ret}\n${response.data}`;              
            })
            .catch(function (error) {
              // handle error
              console.log(error.message);
              ret = `${ret}\nBackendService Failed: ${error.message}`;
            })
            .finally(function () {
  
              // send the response to the client
              res.send(ret);
            });
    });
    

  } else {
    // send the response to the client
    res.send(ret);
  }
  
  return ret;
}



app.listen(app.get('port'), app.get('ip'), function() {
  console.log("App.Version: " + process.env.npm_package_version)
  console.log("--------------------------------------------------------------------")
  console.log("ENV.TEKTON_101: " + app.get('envTektonName'))
  console.log("ENV.TEKTON_101_ENV_EXAMPLE: " + app.get('envTektonExample'))
  console.log("ENV.TEKTON_101_ENV_DELAY: " + app.get('envDelay'))
  console.log("ENV.TEKTON_101_ENV_BACKEND_SERVICE: " + app.get('envBackendService'))
  console.log("ENV.TEKTON_101_ENV_BACKEND_SERVICE_DELAY: " + app.get('envBackendServiceDelay'))
  console.log("ENV.TEKTON_101_ENV_TRACING_ENABLED: " + app.get('envTracingEnabled'))
  console.log("--------------------------------------------------------------------")
  console.log("Node app is running at http://localhost:" + app.get('port'))
  console.log("--------------------------------------------------------------------")
})

module.exports.app = app;
