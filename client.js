'use strict'

const { Multilevel } = require('./leveldown')

module.exports = function (opts) {
  // TODO: consider exporting this directly
  return new Multilevel(opts)
}
