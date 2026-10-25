import {describe,expect,it,vi} from "vitest";
import {Blob} from "node:buffer";

const invoke=vi.hoisted(()=>vi.fn());
vi.mock("./desktop-client",()=>({desktopClient:{invoke}}));
import {transcribeRecordedAudio} from "./recorded-transcription";

describe("recorded voice input",()=>{
  it("sends the encoded recording once and returns plain transcript text",async()=>{
    invoke.mockResolvedValueOnce({text:"Распознанный текст"});
    const blob=new Blob([new Uint8Array([82,73,70,70])],{type:"audio/wav"});
    expect(await transcribeRecordedAudio(blob as globalThis.Blob)).toBe("Распознанный текст");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("transcribe_audio",{audioBase64:"UklGRg==",mediaType:"audio/wav"});
    invoke.mockClear();
  });
  it("rejects empty recordings before a provider request",async()=>{
    await expect(transcribeRecordedAudio(new Blob([]) as globalThis.Blob)).rejects.toThrow("empty");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("does not retry a failed transcription request",async()=>{
    invoke.mockRejectedValueOnce(new Error("synthetic network failure"));
    const blob=new Blob(["sample"],{type:"audio/webm"});
    await expect(transcribeRecordedAudio(blob as globalThis.Blob)).rejects.toThrow("synthetic network failure");
    expect(invoke).toHaveBeenCalledTimes(1);invoke.mockClear();
  });
});
