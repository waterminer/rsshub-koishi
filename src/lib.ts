import xmlConvert from 'xml-js';

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
    return (await tryFetch(fetch(url))).blob();
}

async function downloadText(url: string): Promise<string> {
    return (await tryFetch(fetch(url))).text();
}

async function downloadToJson(url: string):Promise<any> {
    let XMLDoc = await downloadText(url);
    const jsonDoc = JSON.parse(xmlConvert.xml2json(XMLDoc, { compact: true }));
    return jsonDoc;
}

type EnumObject = { [key: string]: string | number };

export function enumToList(enumObject:EnumObject):string[]{
    const keys = Object.keys(enumObject).filter(k => typeof enumObject[k as keyof typeof enumObject] === 'string');
    const values = keys.map(k => enumObject[k as keyof typeof enumObject]);
    const list = keys.map((key, index) => `${key}: ${values[index]}`);
    return list;
}

export default{
    downloadImg,downloadText,downloadToJson,enumToList
}