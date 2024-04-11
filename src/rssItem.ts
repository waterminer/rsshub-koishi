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
    title: { _cdata: string },
    description: { _cdata: string },
    guid: { _text: string },
    link: { _text: string },
    pubDate: { _text: string },
    category: { _text: string }[]
}

export async function CreateRssItem(ctx: Context, item: RawRssItem, channel: RssChannel): Promise<RssItem> {
    try {
        let category = [];
        let title = "NoTitle";
        if (item.title._cdata) title = item.title._cdata;
        if (item.category) category = item.category.map(text => text._text);
        return ctx.database.create('RssItem', {
            cid: channel.id,
            title: title,
            description: item.description._cdata,
            guid: item.guid._text,
            link: item.link._text,
            pubDate: new Date(item.pubDate._text),
            category: category
        })
    } catch (error) {
        throw new Error(`创建频道失败:${error}`);
    }
}