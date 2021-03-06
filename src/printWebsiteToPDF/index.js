const puppeteer = require('puppeteer')
const cheerio = require('cheerio')
const axios = require('axios')
const chalk = require('chalk')
const mapLimit = require('async/mapLimit')

const $util = require('./../helper/util.js')
const $config = require('./config.js')

$util.setConfig($config)

/*
  headless: true 注意产生PDF格式目前仅支持Chrome无头版。 (update@2017-10-25)
  NOTE Generating a pdf is currently only supported in Chrome headless.
  https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagepdfoptions
 */
puppeteer.launch({ headless: true }).then(async browser => {
  let page = await browser.newPage()
  page.setViewport({ width: 1024, height: 2048 })

  page
    .waitForSelector('img')
    .then(async() => {
      executeCrawlPlan(browser, page)
    })

  page.on('requestfinished', result => {
    if (result.url.includes('clustrmaps.com')) {
      $util.onListenUrlChange(page)
    }
  })

  page.on('error', (error) => {
    console.log(chalk.red('whoops! there was an error'))
    console.log(error)
  })

  page.on('pageerror', (error) => {
    console.log(chalk.red('whoops! there was an pageerror'))
    console.log(error)
  })

  await page.goto($config.targetWebsite)
})

const executeCrawlPlan = async (browser, page) => {
  $util.printWithColor(`✔ Start crawling all article links...`, 'success')
  let numList = await page.evaluate(async() => {
    let pageNumList = [...document.querySelectorAll('#page-nav .page-number')]
    return pageNumList.map(item => {
      return item.text
    })
  })
  // 获取到分页总数目(从左到右，有小到大，所以可以如下处置)
  let totalNum = +numList[numList.length - 1]
  let pageLinkArr = [$config.targetWebsite]
  for (let i = 2; i <= totalNum; i++) {
    pageLinkArr.push(`${$config.targetWebsite}/page/${i}`)
  }

  let articleLinkArr = []
  let statisticsCount = 0
  await pageLinkArr.forEach((item) => {
    !(function (citem) {
      getArticleLink(citem).then(result => {
        statisticsCount++
        articleLinkArr = articleLinkArr.concat(result)
        if (statisticsCount === totalNum) {
          executePrintPlan(browser, articleLinkArr)
        }
      })
    }(item))
  })
}

const getArticleLink = (url) => {
  return new Promise((resolve, reject) => {
    return axios.get(url).then((res) => {
      try {
        let $ = cheerio.load(res.data)
        let aHrefList = []
        $util.printWithColor(`The article has been crawled as follows：`, '', 'cyan')
        $('#archive-page .post a').each(function (i, e) {
          let item = {
            href: $(e).attr('href'),
            title: $(e).attr('title')
          }
          $util.printWithColor(` ${item.title}: ${item.href}`)
          aHrefList.push(item)
        })
        return resolve(aHrefList)
      } catch (err) {
        console.log('Opps, Download Error Occurred !' + err)
        resolve({})
      }
    }).catch(err => {
      console.log('Opps, Axios Error Occurred !' + err)
      resolve({})
    })
  })
}

let concurrentCount = 0
const printPageToPdf = async (browser, item) => {
  page = await browser.newPage()
  concurrentCount++
  $util.printWithColor(`Now the number of concurrent is: ${concurrentCount}, What is being printed now is:：${item.href}`, '', 'magenta')
  page.goto($config.targetOrigin + item.href)
  await $util.waitForReadyStateComplete(page)
  $util.executePrintToPdf(page)
  concurrentCount--
}

const executePrintPlan = async (browser, source) => {
  $util.printWithColor(`✔ Okay, Start the print operation.`, 'success')
  mapLimit(source, 1, async (item) => {
    await $util.waitForTimeout(2 * 1000)
    printPageToPdf(browser, item)
  })
  // browser.close()
}
