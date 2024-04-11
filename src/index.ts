import { Context, Schema, Session, h as koshih } from 'koishi';
import { } from 'koishi-plugin-puppeteer';
import { CustomizeChannelArgs, RssChannel, RssChannelArgs, RssChannelType, factoryBuilder, Deliver } from './rssChannel';
import { RssItem, RawRssItem, CreateRssItem } from './rssItem';
import connect, { enumToList } from './lib';

export const name = 'rsshub-koishi'

export const inject = { required: ['database', 'puppeteer'] }

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
    deliver: 'json',
    title: 'string',
    url: 'string',
    args: 'json'
  }, {
    primary: 'id',
    autoInc: true
  });

  ctx.model.extend('RssItem', {
    id: 'integer',
    cid:'integer',
    title:'string',
    description:'string',
    guid:'string',
    link:'string',
    pubDate:'date',
    category:'list'
  }, {
    primary: 'id',
    autoInc: true,
    foreign:{
      cid:['RssChannel','id']
    }
  });

  ctx.command('rss.subscribe <url:text> [guildId:text]').alias('rss.订阅').action(async ({ session }, url, guildId) => {
    try {
      const deliver: Deliver = new UI(session).getDeliver(guildId);
      const channel = await subscribeRssChannel(url, RssChannelType.customize, new CustomizeChannelArgs(), deliver);
      return `频道${channel.title}订阅成功！`;
    } catch (error) {
      logger.error(error) ;
    }
    return '订阅失败';
  })

  ctx.command('rss.getitem <id:text>').alias('rss.查看').action(async({session},id)=>{

  })

  ctx.command('rsstest').action(async ({ session }) => {
    const rssItems = await checkForUpdates();
    const res = await Promise.all(rssItems.map(rssItem=>rssDiv(rssItem)));
    if (res.length) session.send(await render(res.join(),450));
  })

  ctx.on('ready', async () => {
    let listFromDatabase = await ctx.database.get('RssChannel', {});
    channelList = listFromDatabase;
    logger.info(`从数据库中加载了${listFromDatabase.length}个频道`);
  })

  //交互代码
  class UI {
    session: Session;
    constructor(session: Session) {
      this.session = session;
    }

    getDeliver(rawGuildId?: string): Deliver {
      const platform = this.session.platform;
      let deliver: Deliver = [{ platform: platform, guildId: this.session.channelId }];
      if (rawGuildId) {
        const guildIds = rawGuildId.split(',');
        guildIds.forEach(guildId => {
          deliver.push({ platform: platform, guildId: guildId })
        })
      }
      return deliver
    }

    async checkMenuInput(max: number): Promise<number> {
      const value: string = await this.session.prompt(config.TimeOut);
      if (!isNaN(Number(value)) && Number(value) <= max && Number(value) >= 0) {
        return Number(value);
      }
      throw new Error('inputErr');
    }

    async checkUrlInput(): Promise<string> {
      const url: string = await this.session.prompt(config.TimeOut);
      const rule = /^((http:\/\/)|(https:\/\/))?((www\.)|(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})|(localhost))\S*/g;
      let res = rule.exec(url);
      if (res) {
        if (!res[1]) {
          return 'http://' + res[0];
        }
        return res[0];
      }
      throw new Error('inputErr');
    }

    async queryType() {
      const typeMenu = enumToList(RssChannelType);
      const max = typeMenu.length - 1;
      this.session.send(
        `频道订阅向导\n请输入你订阅的频道类型[0~${typeMenu.length - 1}]:\n${typeMenu.join('\n')}`
      );
      const value = await this.checkMenuInput(max);
    }

    async queryUrl() {
      this.session.send(`请输入地址`);
      return this.checkUrlInput()
    }

  }
  async function rssDiv(rssItem:RssItem) {
    const channel = `<h2>#${rssItem.id}:${(await getChannelFromItem(rssItem)).title}</h2>`;
    const title = `<h3>${rssItem.title}</h3>`;
    const description = rssItem.description;
    return `<div>${channel}${title}${description}</div>`;
  }
  async function render(content:string, picWidth:number) {
    // https://github.com/ifrvn/koishi-plugin-send-as-image
    return ctx.puppeteer.render(`<html>
<head>
  <style>
    @font-face {
      font-family: AlibabaPuHuiTi-2-55-Regular;
      src:url(https://puhuiti.oss-cn-hangzhou.aliyuncs.com/AlibabaPuHuiTi-2/AlibabaPuHuiTi-2-55-Regular/AlibabaPuHuiTi-2-55-Regular.woff2) format('woff2');
    }
    html {
      font-family: 'AlibabaPuHuiTi-2-55-Regular', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
      width: ${picWidth}px;
      height: 0;
      background: white;
    }
    div {
      width: 98%;
    }
    img{
      width: 90%;
    }
    video{
      width: 90%;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`);
  }
  //业务代码
  let cachs=new Map<number,RssChannel>();
  async function getChannelFromItem(rssItem:RssItem):Promise<RssChannel> {
    let id = rssItem.cid
    if (cachs.has(id)){
      return cachs.get(id);
    }
    const res = (await ctx.database.get('RssChannel',id)).pop();
    cachs.set(id,res);
    return res;
  }

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
    logger.info(`更新了${newItems.length}个频道！`)
    return Promise.all(newItems.map(item => CreateRssItem(ctx, item, channel)))
  }

  async function subscribeRssChannel(baseUrl: string, type: RssChannelType, args: RssChannelArgs, deliver: Deliver): Promise<RssChannel> {
    const channel = await factoryBuilder(ctx, type).createChannel(baseUrl, args, deliver);
    channelList.push(channel);
    return channel
  }

  async function checkForUpdates(): Promise<RssItem[]> {
    logger.info('开始更新')
    const promises: Promise<RssItem[]>[] = channelList.map(
      channel => createRssItemList(channel)
    );
    return (await Promise.all(promises)).reduce((acc, items) => acc.concat(items), [])
  }
}