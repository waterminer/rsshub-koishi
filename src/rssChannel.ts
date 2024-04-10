import { Context } from 'koishi';
import connect from './lib';

export enum RssChannelType {
    customize = 0,
    pixiv = 1
}

export type Deliver={platform:string,guildId:string}[]

export const EXTRACTRULE: Map<RssChannelType, RegExp> = new Map<RssChannelType, RegExp>([
    [RssChannelType.pixiv, /<img src="(.+?(\.png|\.jpg|\.gif))"/g]
])

export interface RssChannel {
    id: number;
    type: RssChannelType;
    deliver:Deliver;
    title: string;
    url: string;
    args: RssChannelArgs;
}

export interface RssChannelArgs { }

export class CustomizeChannelArgs implements RssChannelArgs { }

class PixivChannelArgs implements RssChannelArgs {
    uid: string = '';
    key: string = '';
    type: string = '';
}

abstract class ChannelFactory {
    ctx: Context;
    constructor(ctx: Context) {
        this.ctx = ctx
    }
    abstract createChannel(url: string, args: RssChannelArgs,deliver:Deliver): Promise<RssChannel>

    async getRssTitle(url: string): Promise<string> {
        this.checkUrl(url);
        return (await connect.downloadToJson(url)).rss.channel.title._cdata
    }

    async checkUrl(url:string) {
        const jsonDoc=(await connect.downloadToJson(url));
        if (!jsonDoc.rss) throw new Error('这不是一个有效的rss订阅链接');
        return
    }
}

class customizeChannelFactory extends ChannelFactory {
    async createChannel(url: string, args: CustomizeChannelArgs,deliver:Deliver): Promise<RssChannel> {
        let title = await this.getRssTitle(url)
        return this.ctx.database.create('RssChannel', {
            type: RssChannelType.customize,
            deliver:deliver,
            title: title,
            url: url,
            args: args
        })
    }
}

class PixivChannelFactory extends ChannelFactory {
    readonly TYPELIST: ReadonlyArray<string> = ["user_activity", "user_bookmark", "user_novels", "keyword", "rankings", "following_timeline"];
    constructor(ctx: Context) {
        super(ctx)
    }
    private _checkInput(value: unknown) {
        if (!value) throw new Error(`Error Parameters:(${value})`);
    }
    async createChannel(RssHubServerUrl: string, args: PixivChannelArgs,deliver:Deliver): Promise<RssChannel> {
        let url = '';
        if (!(this.TYPELIST.includes(args.type))) {
            throw new Error("Error Parameters");
        }
        switch (args.type) {
            case "user_activity": {
                this._checkInput(args.uid);
                url = RssHubServerUrl + `/pixiv/user/${args.uid}`;
                break;
            } case "user_bookmark": {
                this._checkInput(args.uid);
                url = RssHubServerUrl + `/pixiv.valueOf()/user/bookmarks/${args.uid}`;
                break;
            } case "user_novels": {
                this._checkInput(args.uid);
                url = RssHubServerUrl + `/pixiv/user/novels/${args.uid}`;
                break;
            } case "keyword": {
                this._checkInput(args.key);
                url = RssHubServerUrl + `/pixiv/search/${args.key}/safe`;
                break;
            } case "rankings": {
                url = RssHubServerUrl + `/pixiv/ranking/day`;
                break;
            } case "following_timeline": {
                url = RssHubServerUrl + `/pixiv/user/illustfollows`;
                break;
            } default: {
                throw new Error("");
            }
        }
        const title = await this.getRssTitle(url)
        return this.ctx.database.create('RssChannel', {
            type: RssChannelType.pixiv,
            deliver:deliver,
            title: title,
            url: url,
            args: args
        })
    }
}

export function factoryBuilder(ctx: Context, type: RssChannelType): ChannelFactory {
    switch (type) {
        case RssChannelType.customize:
            return new customizeChannelFactory(ctx);
        case RssChannelType.pixiv:
            return new PixivChannelFactory(ctx);
        default:
            throw new Error("");
    }
}