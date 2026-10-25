import {describe,expect,it,vi,afterEach} from "vitest";
import {Blob} from "node:buffer";
import {encodeMonoWav,normalizeRecordedAudio} from "./recorded-audio";

afterEach(()=>vi.unstubAllGlobals());

describe("local recorded audio conversion",()=>{
  it("writes a valid 16 kHz mono PCM16 WAV with bounded samples",()=>{
    const bytes=encodeMonoWav(new Float32Array([-2,-0.5,0,0.5,2,NaN]));
    const view=new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0,4))).toBe("RIFF");
    expect(view.getUint32(4,true)).toBe(bytes.length-8);
    expect(view.getUint16(22,true)).toBe(1);
    expect(view.getUint32(24,true)).toBe(16000);
    expect(view.getUint16(34,true)).toBe(16);
    expect(Array.from({length:6},(_,i)=>view.getInt16(44+i*2,true))).toEqual([-32768,-16384,0,16384,32767,0]);
  });
  it("resamples decoded browser audio locally and closes the decoder",async()=>{
    const close=vi.fn(async()=>{}); const connect=vi.fn(); const start=vi.fn();
    vi.stubGlobal("AudioContext",class {decodeAudioData=async()=>({duration:0.25});close=close;});
    const construct=vi.fn();
    vi.stubGlobal("OfflineAudioContext",class {
      destination={};
      constructor(...args:unknown[]){construct(...args);}
      createBufferSource=()=>({buffer:null,connect,start});
      startRendering=async()=>({getChannelData:()=>new Float32Array(4000)});
    });
    const result=await normalizeRecordedAudio(new Blob(["synthetic"],{type:"audio/webm"}) as globalThis.Blob);
    expect(construct).toHaveBeenCalledWith(1,4000,16000);
    expect(result.byteLength).toBe(8044);expect(close).toHaveBeenCalledOnce();expect(start).toHaveBeenCalledOnce();
  });
  it("rejects invalid audio before decoding or a provider request",async()=>{
    await expect(normalizeRecordedAudio(new Blob([]) as globalThis.Blob)).rejects.toThrow("empty");
  });
});
