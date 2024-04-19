import { RssChannel } from './rssChannel'
import { Context } from 'koishi';
export interface RssItem {
    id: number;
    cid: number;
    title: string;
    category: string[];
    description: string;
    guid: string;
    link: string;
    pubDate: Date;
}

export type RawRssItem = {
    title: {_cdata: string|undefined , _text: string|undefined },
    description: { _cdata: string|undefined , _text: string|undefined },
    guid: { _text: string },
    link: { _text: string },
    pubDate: { _text: string },
    category: { _text: string }[]
}

export async function CreateRssItem(ctx: Context, item: RawRssItem, channel: RssChannel): Promise<RssItem> {
    try {
        let category = [];
        let title = "NoTitle";
        let description = "ERROR";
        if (item.title._cdata) {
            title = item.title._cdata;
        }else if(item.title._text){
            title = item.title._text;
        }
        if (item.description._cdata){
            description = item.description._cdata;
        }else if(item.description._text){
            description = item.description._text;
        }
        if (item.category) category = item.category.map(text => text._text);
        return ctx.database.create('RssItem', {
            cid: channel.id,
            title: title,
            description: description,
            guid: item.guid._text,
            link: item.link._text,
            pubDate: new Date(item.pubDate._text),
            category: category
        })
    } catch (error) {
        throw new Error(`创建频道失败:${error}`);
    }
}