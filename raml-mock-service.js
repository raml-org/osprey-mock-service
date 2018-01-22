var Negotiator = require('negotiator')
var resources = require('osprey-resources')
var osprey = require('osprey')

/**
 * Export the mock server.
 */
module.exports = ospreyMockServer
module.exports.createServer = createServer
module.exports.createServerFromBaseUri = createServerFromBaseUri
module.exports.loadFile = loadFile

/**
 * Create an Osprey server instance.
 *
 * @param  {Object}   raml
 * @return {Function}
 */
function ospreyMockServer (raml) {
  return resources(raml.resources, handler)
}

/**
 * Create a server with Osprey and the mock service.
 *
 * @param  {Object}   raml
 * @param  {Object}   options
 * @return {Function}
 */
function createServer (raml, options) {
  var app = osprey.Router()

  app.use(osprey.server(raml, options))
  app.use(ospreyMockServer(raml))
  app.use(osprey.errorHandler())

  return app
}

/**
 * Create a mock service using the base uri path.
 *
 * @param  {Object}   raml
 * @param  {Object}   options
 * @return {Function}
 */
function createServerFromBaseUri (raml, options) {
  var app = osprey.Router()
  var path = (raml.baseUri || '').replace(/^(\w+:)?\/\/[^/]+/, '') || '/'

  app.use(path, raml.baseUriParameters, createServer(raml, options))

  return app
}

/**
 * Create a mock service from a filename.
 *
 * @param  {String}   filename
 * @param  {Object}   options
 * @return {Function}
 */
function loadFile (filename, options) {
  return require('raml-1-parser')
    .loadRAML(filename, { rejectOnErrors: true })
    .then(function (ramlApi) {
      var raml = ramlApi.expand(true).toJSON({
        serializeMetadata: false
      })
      options['RAMLVersion'] = ramlApi.RAMLVersion()
      return createServerFromBaseUri(raml, options)
    })
}

/**
 * Returns either a random example from examples or the single example.
 *
 * @param {Object} obj
 */
function getSingleExample (obj) {
  if (obj.examples) {
    var randomIndex = Math.floor(Math.random() * obj.examples.length)
    return obj.examples[randomIndex].value
  } else {
    return obj.example
  }
}

/**
 * Create a RAML example method handler.
 *
 * @param  {Object}   method
 * @return {Function}
 */
function handler (method) {
  var statusCode = getStatusCode(method)
  var response = (method.responses || {})[statusCode] || {}
  var bodies = response.body || {}
  var headers = {}
  var types = Object.keys(bodies)

  // Set up the default response headers.
  if (response.headers) {
    Object.keys(response.headers).forEach(function (kheader) {
      var header = response.headers[kheader]
      if (header.default) {
        headers[header.name] = header.default
      } else if (header.example || header.examples) {
        var example = getSingleExample(header)
        headers[header.name] = example
      }
    })
  }

  return function (req, res) {
    var negotiator = new Negotiator(req)
    var type = negotiator.mediaType(types)
    var body = bodies[type]

    res.statusCode = statusCode
    setHeaders(res, headers)

    if (type) {
      res.setHeader('Content-Type', type)
      var example = getSingleExample(body)

      if (example) {
        res.write(typeof example === 'object' ? JSON.stringify(example) : example)
      }
    }

    res.end()
  }
}

/**
 * Get an appropriate HTTP response code.
 *
 * @param  {Object} method
 * @return {Number}
 */
function getStatusCode (method) {
  return Object.keys(method.responses || {})[0] || 200
}

/**
 * Set a map of headers on the response.
 *
 * @param {HTTP.Response} res
 * @param {Object}        headers
 */
function setHeaders (res, headers) {
  Object.keys(headers).forEach(function (key) {
    res.setHeader(key, headers[key])
  })
}
