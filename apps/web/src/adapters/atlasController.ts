export async function requireAtlasController(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const controller = navigator.serviceWorker.controller;
  if (!controller) return;
  const channel = new MessageChannel();
  try {
    const ready = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 2_000);
      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        clearTimeout(timer);
        const reply = event.data;
        resolve(
          !!reply &&
            typeof reply === 'object' &&
            'kind' in reply &&
            reply.kind === 'fgo-lab-atlas-controller-ready' &&
            'version' in reply &&
            reply.version === 5,
        );
      };
    });
    controller.postMessage({ kind: 'fgo-lab-atlas-controller-check' }, [channel.port2]);
    if (!(await ready)) throw new TypeError('atlas_controller_upgrade_required');
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
}
