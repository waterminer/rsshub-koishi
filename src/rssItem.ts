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
        return ctx.database.create('RssItem', {
            cid: channel.id,
            title: item.title._cdata,
            description: item.description._cdata,
            guid: item.guid._text,
            link: item.link._text,
            pubDate: new Date(item.pubDate._text),
            category: item.category.map(text => text._text)
        })
    } catch (error) {
        throw error;
    }
}