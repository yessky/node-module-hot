/*
  author:
    aaron.xiao - <admin@veryos.com>
  summary:
    replace default extension hook
*/

const Module = require('module');

const toString = Object.prototype.toString;
const defaultHanlder = Module._extensions[ '.js' ];
const handledExtensions = {};

function getCtor(obj) {
  return toString.call(obj).match(/\[object\s+(\w+)\]/)[ 1 ]
}

function isGenerator(obj) {
  return 'function' == typeof obj.next && 'function' == typeof obj.throw
}

function isGeneratorFunction(obj) {
  const constructor = obj.constructor;
  if (!constructor) return false
  if ('GeneratorFunction' === constructor.name || 'GeneratorFunction' === constructor.displayName) return true
  return isGenerator(constructor.prototype)
}

function hook(ext) {
  if (handledExtensions[ ext ]) return
  let extensionHandler = Module._extensions[ ext ];
  if (!extensionHandler) {
    extensionHandler = defaultHanlder
  }
  handledExtensions[ ext ] = true;
  Module._extensions[ ext ] = function (module, filename) {
    // call default handler
    extensionHandler(module, filename);
    // skip native modules
    if (module.id.indexOf('node_modules') > -1) return
    // create hot wrapper for exports
    let hotExports = module.__hotExports;
    let newExports = module.exports;
    let type = typeof newExports;
    let ctor = getCtor(newExports);
    if (!hotExports) {
      if (type === 'string') {
        hotExports = new String('');
        hotExports.valueOf = hotExports.toString = function () {
          return String(module.__hotRef)
        };
      } else if (type === 'number') {
        hotExports = new Number(0);
        hotExports.valueOf = hotExports.toString = function () {
          return Number(module.__hotRef)
        }
      } else if (type === 'boolean') {
        hotExports = new Boolean(false);
        hotExports.valueOf = hotExports.toString = function () {
          return Boolean(module.__hotRef)
        }
      } else if (type === 'function') {
        if (isGeneratorFunction(newExports)) {
          hotExports = function* (...args) {
            const iterator = module.__hotRef.apply(module.exports, args);
            let returned;
            while (true) {
              returned = iterator.next();
              if (returned.done) break;
              yield returned.value;
            }
            if (typeof returned.value !== 'undefined') return returned.value;
          }
        } else if (ctor === 'AsyncFunction') {
          hotExports = async function (...args) {
            return await module.__hotRef.apply(module.exports, args)
          }
        } else {
          hotExports = function HotCtor(...args) {
            if (this instanceof HotCtor) {
              module.__hotRef.apply(this, args)
            } else {
              return module.__hotRef.apply(module.exports, args)
            }
          }
        }
      } else if (ctor === 'Array' || ctor === 'Object') {
        hotExports = newExports
      }
      if (hotExports) {
        module.__hotExports = hotExports
      }
    }
    // hot update wrapped exports
    if (hotExports) {
      if (ctor === 'Array') {
        let len1 = hotExports.length;
        let len2 = newExports.length;
        if (len1 > len2) {
          hotExports.splice(len2 - 1, len1 - len2)
        }
        Object.assign(hotExports, newExports)
      } if (ctor === 'Object') {
        for (let i in hotExports) {
          if (!newExports.hasOwnProperty(i)) {
            delete hotExports[ i ]
          }
        }
        Object.assign(hotExports, newExports)
      } else {
        module.__hotRef = newExports
      }
      module.exports = hotExports
    }
  }
}

module.exports = hook
