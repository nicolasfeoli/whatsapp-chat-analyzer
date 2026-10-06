/* Runs parsing and analysis off the main thread, and keeps the chat text between runs so the date-order switch can re-read it. */
importScripts('core.js');
let raw=null;
onmessage=e=>{
  const d=e.data;if(d.raw!==undefined)raw=d.raw;
  try{
    if(raw===null)throw new Error('Load the file again.');
    postMessage({id:d.id,stage:'Analysing the chat …'});
    postMessage(Object.assign({id:d.id},ChatCore.crunch(raw,d.order,d.locale)));
  }catch(err){postMessage({id:d.id,error:err.message||'Could not analyse that file.'});}
};
