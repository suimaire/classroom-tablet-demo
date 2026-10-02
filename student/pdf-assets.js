// All pinned PDF.js data assets are bundled locally to preserve CJK support without hundreds of files.
let bundlePromise;
export class LocalPdfBinaryDataFactory {
  async fetch({kind, filename}) {
    if (!['cMapUrl','standardFontDataUrl','wasmUrl'].includes(kind) || !/^[\w.-]+$/.test(filename)) throw Error('Invalid PDF asset');
    bundlePromise ??= fetch(new URL('./binary-assets.json', import.meta.url)).then(r => {if(!r.ok) throw Error('PDF asset bundle unavailable');return r.json();}).catch(e=>{bundlePromise=undefined;throw e;});
    const bundle=await bundlePromise, encoded=bundle[`${kind}/${filename}`];
    if(typeof encoded!=='string') throw Error(`Missing PDF asset: ${filename}`);
    return Uint8Array.from(atob(encoded), c=>c.charCodeAt(0));
  }
}
