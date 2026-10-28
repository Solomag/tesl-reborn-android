// hook.ts attaches through hookAttach (a timing wrapper defined at the top of
// the hook, outside the extracted sections): give every test context one
// that forwards to that context's Interceptor stub.
const vm = require('node:vm');
const createContext = vm.createContext;
vm.createContext = (context = {}, ...rest) => {
  if (!('hookAttach' in context)) context.hookAttach = (target, callbacks) => context.Interceptor.attach(target, callbacks);
  return createContext(context, ...rest);
};
