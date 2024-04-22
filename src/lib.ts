import xmlConvert from 'xml-js';
import { Context } from 'koishi'

class HTMLError extends Error {
    constructor(response: Response) {
        super("HTMLError!code:" + response.status);
    }
}

async function tryFetch(promise: Promise<Response>, retry: number = 3): Promise<Response> {
    while (retry > 0) {
        try {
            const response = await promise;
            if (response.ok) {
                return response;
            } else throw new HTMLError(response);
        } catch (error) {
            retry--;
            if (error instanceof Error) console.error(error.message + ",retry:" + retry);
            else console.error("Unknown Error!");
        }
    }
    throw new Error("FetchError");
}

async function downloadImg(url: string): Promise<Blob> {
    try {
        return (await tryFetch(fetch(url))).blob();
    } catch (error) {
        if (error instanceof Error) console.error(`download ${url} Error!\n${error.message}`);
    }
}

async function downloadText(url: string): Promise<string> {
    try {
        return (await tryFetch(fetch(url))).text();
    } catch (error) {
        if (error instanceof Error) console.error(`download ${url} Error!\n${error.message}`);
    }
}

async function downloadToJson(url: string): Promise<any> {
    let XMLDoc = await downloadText(url);
    const jsonDoc = JSON.parse(xmlConvert.xml2json(XMLDoc, { compact: true }));
    return jsonDoc;
}

type EnumObject = { [key: string]: string | number };

export function enumToList(enumObject: EnumObject): string[] {
    const keys = Object.keys(enumObject).filter(k => typeof enumObject[k as keyof typeof enumObject] === 'string');
    const values = keys.map(k => enumObject[k as keyof typeof enumObject]);
    const list = keys.map((key, index) => `${key}: ${values[index]}`);
    return list;
}
export function checkUrl(url: string): string {
    const rule = /^((http:\/\/)|(https:\/\/))?((www\.)|(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})|(localhost)|(rsshub)|(yangzhi))\S*/g;
    let res = rule.exec(url);
    if (res) {
        if (!res[1]) {
            return 'http://' + res[0];
        }
        return res[0];
    }
    throw new Error('这不是有效的链接');
}

export async function newDownloadText(ctx: Context, url: string) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(await ctx.http.get(url));
}

export async function koishiDownloadJson(ctx: Context, url: string) {
    let XMLDoc = await newDownloadText(ctx, url);
    return JSON.parse(xmlConvert.xml2json(XMLDoc, { compact: true }));
}

export async function newDownloadImage(ctx: Context, url: string) {
    let binary: ArrayBuffer = await ctx.http.get(url);
    return new Blob([binary]);
}

export default {
    checkUrl, downloadImg, downloadText, downloadToJson, enumToList, koishiDownloadJson
}