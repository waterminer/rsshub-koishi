import { $, Context, Schema, Session } from 'koishi';
import { } from 'koishi-plugin-puppeteer';
import { RssChannel, RssChannelType, factoryBuilder, Deliver } from './rssChannel';
import { RssItem, RawRssItem, CreateRssItem } from './rssItem';
import lib from './lib';

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
  Cycle: number
}

export const Config: Schema<Config> = Schema.object({
  RssHubServerUrl: Schema.string().default('http://rsshub.app').description('RssHub服务地址(若是在中国大陆使用，推荐换源或是自建)'),
  TimeOut: Schema.number().default(60000).description('输入超时时间(ms)'),
  Cycle: Schema.number().default(60000).description('订阅更新周期时间(ms)'),
});

export function apply(ctx: Context, config: Config) {
  const rsshubServerUrl = config.RssHubServerUrl;
  const mainDoc =
    `
====rsshub订阅推送插件帮助====
所属指令
rssitem 关于rss项目相关的指令
rsschannel 关于rss频道相关的指令
快捷指令
rss 订阅/rss dy 订阅rss频道
rss 查看/rss get 查看rss项目
rss 列表/rss list 订阅的频道列表
更多帮助在各个指令末尾加上 -h查看
  `;
  let channelList: RssChannel[];
  const logger = ctx.logger('rsshub');
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
    cid: 'integer',
    title: 'string',
    description: 'string',
    guid: 'string',
    link: 'string',
    pubDate: 'date',
    category: 'list'
  }, {
    primary: 'id',
    autoInc: true,
    foreign: {
      cid: ['RssChannel', 'id']
    }
  });

  ctx.command('rss')
    .usage(mainDoc)
    .action(() => {
      return mainDoc;
    })

  ctx.command('rss/rsschannel.subscribe [guildId:text]', '订阅频道')
    .alias('rss.subscribe')
    .alias('rss.订阅')
    .alias('rss.dy')
    .option('no-default', '-d 不包含发送指令的当前群')
    .usage('默认包含发送订阅指令的当前群\n结尾加上推送的目标群，以英文逗号间隔群号')
    .example('rsschannel subscribe 12345,54321')
    .action(async ({ session, options }, guildId) => {
      const ui = new UI(session)
      let channel: RssChannel = undefined;
      try {
        const deliver: Deliver = ui.getDeliver(guildId, options['no-default']);
        const type = await ui.queryType();
        channel = await subscribeRssChannel(session, type, deliver);
      } catch (error) {
        logger.error(error);
        if (error instanceof Error) {
          return `订阅失败:\n${error.message}`;
        } else {
          return `订阅失败`;
        }
      }
      try {
        session.send(`频道${channel.title}订阅成功！\n请问需要立刻发送该频道最新的5条信息吗？\n1.是\n2.否`);
        let value = await ui.checkMenuInput(2, 1);
        let message = "";
        const items = await createRssItemList(channel);
        switch (value) {
          case 1: {
            if (items.length <= 5) {
              message = await spliceRssItems(items);
            } else {
              message = await spliceRssItems(items.splice(0, 5));
            }
            break;
          } case 2: {
            message = "取消输出";
            break;
          }
          default:
            message = "输入错误,取消输出";
            break;
        }
        return message;
      } catch (error) {
        logger.error(error);
        if (error instanceof Error) {
          return (`发送失败:\n${error.message}`);
        } else {
          return ("发送失败:未知错误")
        }
      }
    });

  ctx.command('rss/rssitem.get <id:number>', '查看项目')
    .alias('rss/rssitem.查看')
    .alias('rss.查看')
    .alias('rss.get')
    .action(async ({ session }, id) => {
      try {
        if (!id) {
          return "指令错误,请输入条目ID(如:rss getitem 1)";
        }
        const items: RssItem[] = (await ctx.database.get('RssItem', id));
        if (!items) return '没有找到对应的条目，请检查输入';
        return spliceRssItems(items);
      } catch (error) {
        logger.error(error);
        if (error instanceof Error) {
          return (error.message);
        } else {
          return ("未知错误");
        }
      }
    });

  ctx.command('rss/rssitem.list <cid:number> [page:number]', "展示某频道下的项目")
    .alias('rss/rssitem.列表')
    .option('old', "-o 按日期从旧到新排序")
    .usage("输出内容按每页10条展示,查看更多需要在指令结尾输入页码")
    .example("rssitem list 8 2 --old")
    .action(async ({ session, options }, cid, page) => {
      if (!cid) return "指令错误,请输入频道ID";
      if (!page || page <= 0) page = 1;
      let orderBy: 'asc' | 'desc' = 'desc'
      if (options.old) orderBy = 'asc'
      const res: RssItem[] = await ctx.database.select('RssItem')
        .where({ cid: cid })
        .orderBy('pubDate', orderBy)
        .limit(10)
        .offset(10 * (page - 1))
        .execute();
      if (res.length == 0) return "找不到项目,请检查输入的频道id或页码"
      const itemText: string = res.map(item =>
        `<tr><td>${item.id}</td><td>${item.title}</td></tr>`
      ).join("");
      const text = `<p>项目列表</p><table border=0><tr><td>序号</td><td>标题</td></tr>${itemText}</table>`;
      return render(text, 250);
    });



  ctx.command('rss/rsschannel.list', '展示订阅的频道列表')
    .alias('rss/rsschannel.列表')
    .alias('rss.list')
    .alias('rss.列表')
    .action(() => {
      const list = channelList.map(channel => {
        return `<tr><td>${channel.id}</td><td>${channel.title}</td></tr>`;
      })
      const text = `<p>频道列表</p><table border=0><tr><td>序号</td><td>标题</td></tr>${list.join("")}</table>`;
      return render(text, 250);
    });

  ctx.command('rss/rsschannel.remove <id:number>', "删除频道及其所属的项目")
    .alias('rss/rsschannel.删除')
    .action(async ({ session }, id) => {
      if (!id) return "指令错误,请输入频道ID";
      const sqlResult = await ctx.database.get('RssChannel', id);
      if (sqlResult.length == 0) return "频道不存在，请检查输入！";
      const channel = sqlResult.pop();
      session.send(`是否永久删除“${channel.title}”以及其下所有的项目?此操作不可逆哦!\n确认请回复“确认”,输入其他或超时则取消`);
      try {
        let value = await session.prompt(config.TimeOut);
        if (value === "确认") {
          ctx.database.remove('RssItem', { cid: id });
          ctx.database.remove('RssChannel', id);
          channelList = await ctx.database.get('RssChannel', {});
          return `“${channel.title}”删除成功！`;
        }
      } catch (error) { }
      return "删除取消";
    });

  ctx.command('rss/rsschannel.deliver <id:number>',"显示频道的推送目标")
  .alias('rss/rsschannel.推送目标')
  .action(async ({session},id) => {
    if(!id) return "指令错误,请输入频道ID";
    try {
      const channel = (await ctx.database.get('RssChannel',id)).pop();
      const res = channel.deliver.map((element)=>`${element.platform}:${element.guildId}`);
      const text = `推送列表:<br>${res.join("<br>")}`;
      return render(text,250);
    } catch (error) {
      logger.error(error)
      if(error instanceof Error){
        return(`错误:\n${error.message}`)
      }
    }
  });

  ctx.command('rss/rsschannel.deliverto <id:number> <guildId:text>', "修改推送目标群")
    .alias('rss/rsschannel.推送设置')
    .option('no-default', '-d 不包含发送指令的当前群')
    .action(async ({ session, options }, id, guildId) => {
      try {
        if (!id || !guildId) return "指令错误";
        const sqlResult = await ctx.database.get('RssChannel', id);
        if (sqlResult.length == 0) return "频道不存在，请检查输入！";
        const channel = sqlResult.pop();
        const ui = new UI(session);
        let deliver: Deliver = ui.getDeliver(guildId, options['no-default']);
        ctx.database.set('RssChannel', id, {
          deliver: deliver
        });
        return "修改完成！";
      } catch (error) {
        if (error instanceof Error) {
          logger.error(error.message);
          return (error.message);
        } else {
          logger.error(error);
        }
      }
    });

  ctx.timer.setInterval(broadcastNews, config.Cycle);

  ctx.on('ready', async () => {
    channelList = await ctx.database.get('RssChannel', {});
    logger.info(`从数据库中加载了${channelList.length}个频道`);
  })

  function broadcast(deliver: Deliver, message: string) {
    const temp = deliver.map(
      element => `${element.platform}:${element.guildId}`
    );
    ctx.broadcast(temp, message);
  }
  async function spliceRssItems(rssItems: RssItem[]) {
    const temp = (await Promise.all(rssItems.map(item => rssDiv(item)))).join("<hr>");
    return render(temp, 480);
  }
  async function broadcastNews() {
    const NewsItems = await checkForUpdates();
    if (!NewsItems) return;
    const groups = await Promise.all(NewsItems.map(async (element) => {
      const deliver = element.channel.deliver;
      const message = await spliceRssItems(element.items);
      return { deliver: deliver, message: message }
    }))
    groups.forEach(group => {
      broadcast(group.deliver, group.message)
    })
    return;
  }
  //交互代码
  class UI {
    session: Session;
    constructor(session: Session) {
      this.session = session;
    }

    getDeliver(rawGuildId?: string, selfDeliver = false): Deliver {
      let deliver: Deliver = []
      const platform = this.session.platform;
      if (!selfDeliver) {
        deliver.push({ platform: platform, guildId: this.session.channelId });
      }
      if (rawGuildId) {
        const guildIds = rawGuildId.split(',');
        guildIds.forEach(guildId => {
          deliver.push({ platform: platform, guildId: guildId })
        })
      }
      if (!rawGuildId && selfDeliver) throw new Error("-d 时必须要指定目标群聊")
      return deliver
    }

    async checkMenuInput(max: number, min: number = 0): Promise<number> {
      const value: string = await this.session.prompt(config.TimeOut);
      if (!isNaN(Number(value)) && Number(value) <= max && Number(value) >= min) {
        return Number(value);
      }
      throw new Error('输入错误');
    }

    async queryType(): Promise<number> {
      const typeMenu = lib.enumToList(RssChannelType);
      const max = typeMenu.length - 1;
      this.session.send(
        `频道订阅向导\n请输入你订阅的频道类型[0~${typeMenu.length - 1}]:\n${typeMenu.join('\n')}`
      );
      return await this.checkMenuInput(max);
    }

  }
  async function rssDiv(rssItem: RssItem) {
    const channel = `<h2>#${rssItem.id}:${(await getChannelFromItem(rssItem)).title}</h2>`;
    const title = `<h3>${rssItem.title}</h3>`;
    const description = `<div>${rssItem.description}</div>`;
    const date = `<div style='font-size:12px; color:gray;' >${rssItem.pubDate}</div>`;
    return `<div>${channel}${title}${description}${date}</div>`;
  }
  async function render(content: string, picWidth: number) {
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
  let caches = new Map<number, RssChannel>();
  async function getChannelFromItem(rssItem: RssItem): Promise<RssChannel> {
    let id = rssItem.cid
    if (caches.has(id)) {
      return caches.get(id);
    }
    const res = (await ctx.database.get('RssChannel', id)).pop();
    caches.set(id, res);
    return res;
  }

  async function createRssItemList(channel: RssChannel): Promise<RssItem[]> {
    const jsonObject = await lib.koishiDownloadJson(ctx, channel.url)
    const items: RawRssItem[] = jsonObject.rss.channel.item;
    const newItems: RawRssItem[] = [];
    for (const item of items) {
      const archivedItems = await ctx.database.get('RssItem', { guid: item.guid._text });
      if (archivedItems.length == 0) {
        newItems.push(item);
      }
    }
    logger.debug(`更新了‘${channel.title}’频道下的${newItems.length}个条目！`);
    return Promise.all(newItems.map(item => CreateRssItem(ctx, item, channel)));
  }

  async function subscribeRssChannel(session: Session, type: RssChannelType, deliver: Deliver): Promise<RssChannel> {
    const channelFactory = factoryBuilder(ctx, type);
    const args = await channelFactory.printMenu(session, config.TimeOut);
    const channel = await channelFactory.createChannel(rsshubServerUrl, args, deliver);
    channelList.push(channel);
    return channel;
  }

  async function checkForUpdates(): Promise<{ channel: RssChannel, items: RssItem[] }[]> {
    logger.info('开始更新');
    let res = await Promise.all(channelList.map(async (channel: RssChannel) => {
      const items = await createRssItemList(channel);
      return { channel, items };
    }))
    res = res.filter(element => element.items.length != 0);
    logger.info(`更新了${res.length}个频道`)
    return res;
  }
}