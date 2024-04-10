import { Context, Schema, Session } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import { CustomizeChannelArgs, RssChannel, RssChannelArgs, RssChannelType, factoryBuilder,Deliver } from './rssChannel';
import { RssItem, RawRssItem, CreateRssItem } from './rssItem';
import connect, { enumToList } from './lib';


export const name = 'rsshub-koishi'

export const inject = { required: ['database', 'puppeteer', 'logger'] }

declare module 'koishi' {
  interface Tables {
    RssChannel: RssChannel;
    RssItem: RssItem;
  }
}

export interface Config {
  RssHubServerUrl: string,
  TimeOut: number,
}

export const Config: Schema<Config> = Schema.object({
  RssHubServerUrl: Schema.string().default('http://rsshub.app').description('RssHub服务地址'),
  TimeOut: Schema.number().default(10000).description('输入超时时间(ms)'),
})

export function apply(ctx: Context, config: Config) {
  let channelList: RssChannel[];
  let logger = ctx.logger('rsshub');
  ctx.model.extend('RssChannel', {
    id: 'integer',
    type: 'integer',
    title: 'string',
    url: 'string',
    args: 'json'
  }, {
    primary: 'id',
    autoInc: true
  });

  ctx.model.extend('RssItem', {
    id: 'integer',
    cid: 'integer',
    title: 'string',
    description: 'string',
    guid: 'string',
    link: 'string',
    pubDate: 'date',
    category: 'list'
  }), {
    Primary: 'id',
    autoInc: true,
    foreign: {
      cid: ['RssChannel', 'id']
    }
  };

  ctx.command('rss.subscribe <url:text>').alias('rss.订阅').action(async ({session},url) => {
    try {
      const deliver = [{platform:session.bot.platform,guildId:session.channelId}];
      const channel = await subscribeRssChannel(url, RssChannelType.customize, new CustomizeChannelArgs(),deliver)
      return `频道${channel.title}订阅成功！`
    } catch (error) {
      logger.error(error)
    }
  })

  ctx.command('minersstest').action(async ({ session }) => {
    session.send(`${session.bot.platform}:${session.bot.selfId}/${session.channelId}`)
  })

  ctx.on('ready', async () => {
    let listFromDatabase = await ctx.database.get('RssChannel', {});
    channelList = listFromDatabase;
    logger.info(`从数据库中加载了${listFromDatabase.length}个频道`);
  })

  //交互代码
  class UI{
    session: Session;
    constructor(session:Session){
      this.session=session;
    }

    async checkMenuInput(max:number):Promise<number> {
      const value:string = await this.session.prompt(config.TimeOut);
      if (!isNaN(Number(value)) && Number(value) <= max && Number(value) >= 0){
        return Number(value);
      }
      throw new Error('inputErr');
    }

    async checkUrlInput():Promise<string>{
      const url:string = await this.session.prompt(config.TimeOut);
      const rule = /^((http:\/\/)|(https:\/\/))?((www\.)|(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})|(localhost))\S*/g;
      let res = rule.exec(url);
      if(res){
        if(!res[1]){
          return 'http://'+res[0];
        }
        return res[0];
      }
      throw new Error('inputErr');
    }

    async queryType() {
      const typeMenu = enumToList(RssChannelType);
      const max = typeMenu.length-1;
      this.session.send(
        `频道订阅向导\n请输入你订阅的频道类型[0~${typeMenu.length - 1}]:\n${typeMenu.join('\n')}`
      );
      const value = await this.checkMenuInput(max);
    }

    async queryUrl(){
      this.session.send(
        `请输入地址`
      );
      return this.checkUrlInput()
    }

  }

  //业务代码

  async function createRssItemList(channel: RssChannel) {
    const jsonObject = await connect.downloadToJson(channel.url)
    const items: RawRssItem[] = jsonObject.rss.channel.item;
    const newItems: RawRssItem[] = [];
    for (const item of items) {
      const archivedItems = await ctx.database.get('RssItem', { guid: item.guid._text });
      if (archivedItems.length == 0) {
        newItems.push(item);
      }
    }
    return Promise.all(newItems.map(item => CreateRssItem(ctx, item, channel)))
  }

  async function subscribeRssChannel(baseUrl: string, type: RssChannelType, args: RssChannelArgs,deliver:Deliver): Promise<RssChannel> {
    const channel = await factoryBuilder(ctx, type).createChannel(baseUrl, args,deliver);
    channelList.push(channel);
    return channel
  }

  async function checkForUpdates(): Promise<RssItem[]> {
    const promises: Promise<RssItem[]>[] = channelList.map(
      channel => createRssItemList(channel)
    );
    return (await Promise.all(promises)).reduce((acc, items) => acc.concat(items), [])
  }
}