import { Context, Session } from 'koishi';
import connect from './lib';
import { title } from 'process';
import { error } from 'console';
export enum RssChannelType {
    customize = 0,
    pixiv = 1,
    twitter = 2
}

export type Deliver = { platform: string, guildId: string }[]

export const EXTRACTRULE: Map<RssChannelType, RegExp> = new Map<RssChannelType, RegExp>([
    [RssChannelType.pixiv, /<img src="(.+?(\.png|\.jpg|\.gif))"/g]
]);

export interface RssChannel {
    id: number;
    type: RssChannelType;
    deliver: Deliver;
    title: string;
    url: string;
    args: RssChannelArgs;
}

export interface RssChannelArgs { }

export class CustomizeChannelArgs implements RssChannelArgs { }

class PixivChannelArgs implements RssChannelArgs {
    uid: string = '';
    keyword: string = '';
    type: string = '';
    mode: string = '';
}

class TwitterChannelArgs implements RssChannelArgs {
    user_name: string = '';
    type: string = '';
}

abstract class ChannelFactory {
    ctx: Context;
    constructor(ctx: Context) {
        this.ctx = ctx;
    }
    abstract createChannel(url: string, args: RssChannelArgs, deliver: Deliver): Promise<RssChannel>;
    abstract printMenu(session: Session, timeOut: number): Promise<RssChannelArgs>;
    async getRssTitle(url: string): Promise<string> {
        const jsonDoc = await this.checkUrl(url);
        const title = jsonDoc.rss.channel.title;
        if (title._cdata) return jsonDoc.rss.channel.title._cdata;
        if (title._text) return jsonDoc.rss.channel.title._text;
    }

    async checkUrl(url: string) {
        const jsonDoc = (await connect.koishiDownloadJson(this.ctx, url));
        if (!jsonDoc.rss) throw new Error('这不是一个有效的rss订阅链接');
        return jsonDoc;
    }
    async checkMenuInput(max: number, session: Session, timeOut: number): Promise<number> {
        const value: string = await session.prompt(timeOut);
        if (!isNaN(Number(value)) && Number(value) <= max && Number(value) > 0) {
            return Number(value);
        }
        throw new Error('inputErr');
    }
}

class customizeChannelFactory extends ChannelFactory {
    url: string = '';
    async printMenu(session: Session, timeOut: number): Promise<CustomizeChannelArgs> {
        session.send('请输入url');
        this.url = await session.prompt(timeOut);
        return new CustomizeChannelArgs()
    }
    async createChannel(inputUrl: string, args: CustomizeChannelArgs, deliver: Deliver): Promise<RssChannel> {
        let url: string = this.url;
        if (!url) url = inputUrl;
        let title = await this.getRssTitle(url)
        return this.ctx.database.create('RssChannel', {
            type: RssChannelType.customize,
            deliver: deliver,
            title: title,
            url: url,
            args: args
        })
    }
}

class PixivChannelFactory extends ChannelFactory {
    readonly TYPELIST: ReadonlyArray<string> = [
        "user_activity",
        "user_bookmark",
        "keyword",
        "rankings",
        "following_timeline"
    ];
    readonly RANKLIST: ReadonlyArray<string> = [
        "day",
        "weak",
        "month"
    ];
    constructor(ctx: Context) {
        super(ctx);
    }
    private _checkInput(value: unknown) {
        if (!value) throw new Error(`Error Parameters:(${value})`);
    }
    async printMenu(session: Session, timeOut: number): Promise<PixivChannelArgs> {
        let args = new PixivChannelArgs()
        let typeMap = new Map<number, string>(
            this.TYPELIST.map((element, index) => [index + 1, element])
        );
        let modeMap = new Map<number, string>(
            this.RANKLIST.map((element, index) => [index + 1, element])
        );
        session.send(`请选择类型:\n1.用户动态\n2.用户收藏\n3.关键词\n4.排行榜`);
        let value = await this.checkMenuInput(this.TYPELIST.length, session, timeOut);
        args.type = typeMap.get(value);
        switch (value) {
            case 1: {
                session.send('请输入用户ID(uid)');
                args.uid = await session.prompt(timeOut);
                break;
            } case 2: {
                session.send('请输入用户ID(uid)');
                args.uid = await session.prompt(timeOut);
                break;
            } case 3: {
                session.send('请输入关键词');
                args.keyword = await session.prompt(timeOut);
                break;
            } case 4: {
                session.send('请输入排行榜类型:\n1.日榜\n2.周榜\n3.月榜');
                const value = await this.checkMenuInput(this.RANKLIST.length, session, timeOut);
                args.mode = modeMap.get(value);
                break;
            } default:
                throw new Error('inputErr');
        }
        return args;
    }
    async createChannel(rssHubServerUrl: string, args: PixivChannelArgs, deliver: Deliver): Promise<RssChannel> {
        let url = '';
        if (!(this.TYPELIST.includes(args.type))) {
            throw new Error("Error Parameters");
        }
        switch (args.type) {
            case "user_activity": {
                this._checkInput(args.uid);
                url = rssHubServerUrl + `/pixiv/user/${args.uid}`;
                break;
            } case "user_bookmark": {
                this._checkInput(args.uid);
                url = rssHubServerUrl + `/pixiv/user/bookmarks/${args.uid}`;
                break;
            } case "keyword": {
                this._checkInput(args.keyword);
                url = rssHubServerUrl + `/pixiv/search/${args.keyword}/safe`;
                break;
            } case "rankings": {
                url = rssHubServerUrl + `/pixiv/ranking/${args.mode}`;
                break;
            } case "following_timeline": {
                url = rssHubServerUrl + `/pixiv/user/illustfollows`;
                break;
            } default: {
                throw new Error("inputErr");
            }
        }
        const title = await this.getRssTitle(url);
        return this.ctx.database.create('RssChannel', {
            type: RssChannelType.pixiv,
            deliver: deliver,
            title: title,
            url: url,
            args: args
        });
    }
}

class TwitterChannelFactory extends ChannelFactory {
    constructor(ctx: Context) {
        super(ctx);
    }
    readonly TYPELIST: ReadonlyArray<string> = [
        'user_time_line',
        'user_media'
    ];
    async createChannel(rssHubServerUrl: string, args: TwitterChannelArgs, deliver: Deliver): Promise<RssChannel> {
        let url = '';
        switch (args.type) {
            case "user_time_line": {
                url = rssHubServerUrl + `/twitter/user/${args.user_name}`;
                break;
            }
            case "user_media": {
                url = rssHubServerUrl + `/twitter/media/${args.user_name}`;
                break;
            }
            default: {
                throw new Error('inputErr');
            }
        }
        const title = await this.getRssTitle(url);
        return this.ctx.database.create('RssChannel', {
            type: RssChannelType.twitter,
            deliver: deliver,
            title: title,
            url: url,
            args: args
        });
    }
    async printMenu(session: Session, timeOut: number): Promise<RssChannelArgs> {
        let args = new TwitterChannelArgs();
        let typeMap = new Map<number, string>(
            this.TYPELIST.map((element, index) => [index + 1, element])
        );
        session.send(`请选择类型:\n1.用户动态\n2.用户媒体`);
        let value = await this.checkMenuInput(this.TYPELIST.length, session, timeOut);
        args.type = typeMap.get(value);
        switch (value) {
            case 1: {
                session.send('请输入用户名(推特‘@’后面的字母)');
                args.user_name = await session.prompt(timeOut);
                break;
            }
            case 2: {
                session.send('请输入用户名(推特‘@’后面的字母)');
                args.user_name = await session.prompt(timeOut);
                break;
            }
            default: {
                throw new Error("inputErr");
            }
        }
        return args;
    }
}

export function factoryBuilder(ctx: Context, type: RssChannelType): ChannelFactory {
    switch (type) {
        case RssChannelType.customize:
            return new customizeChannelFactory(ctx);
        case RssChannelType.pixiv:
            return new PixivChannelFactory(ctx);
        case RssChannelType.twitter:
            return new TwitterChannelFactory(ctx);
        default:
            throw new Error("");
    }
}