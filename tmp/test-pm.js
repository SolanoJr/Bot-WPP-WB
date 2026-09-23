const pm = globalThis.__platformManager;
if (!pm) {
  console.error('NO_GLOBAL_PLATFORM_MANAGER');
  process.exit(1);
}
console.log('Got PM from globalThis');
