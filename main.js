import path from 'node:path'
import axios from 'axios';
import { load } from 'cheerio';
import fs from 'node:fs/promises';
import PQueue from 'p-queue';

const queue = new PQueue({ concurrency: 50 });
const client = axios.create({
  baseURL: "http://ti-kh.org/"
});

await fs.mkdir("datasets", { recursive: true });

async function downloadImage(url, dir) {
  console.log('download image:', url)
  const { data, headers } = await client.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(data);
  const filename = path.basename(url);
  const filepath = path.join(dir, filename);
  await fs.writeFile(filepath, buffer);
}

async function root() {
  const { data: html } = await client.get("/");
  const $ = load(html);

  const books = [];

  for (const item of $(".books-boxes")) {
    queue.add(async () => {
      const anchor = $(item).find('a[title]');
      const href = anchor.attr("href")
      const title = anchor.attr('title')
      const imageSrc = $(item).find('img').attr('src');
      const dirpath = path.join("datasets", title);

      await fs.mkdir(dirpath, { recursive: true });
      await downloadImage(imageSrc, dirpath);

      await fs.writeFile(
        path.join(
          dirpath,
          "data.json"
        ),

        JSON.stringify({
          title,
          imageSrc,
          href: new URL(href, "http://ti-kh.org/").href,
          contents: await section(href),
        }, null, 2)
      )
    })
  }

  return books
}

async function detail(url) {
  console.log('download detail:', url);
  const {
    data: html
  } = await client.get(url);
  const $ = load(html);
  const content = $("#maincontent_divDetails > div:nth-child(2) > div:nth-child(2)").html();
  if (!content) return;
  return content.trim()
}

async function section(url) {
  console.log('download section:', url)
  const { data: html } = await client.get(url);

  const $ = load(html);
  const items = [];

  let currentHeader;

  for (const row of $(".table table tr")) {
    const header = $(row).find('td[colspan]')
      .text()
      .trim();

    // found header
    if (header) {
      currentHeader = header;
      continue;
    }

    const anchor = $(row).find('td a[href]');
    const href = anchor.attr('href');
    const text = anchor.text().trim();
    if (!href) continue;

    items.push({
      header: currentHeader,
      href: new URL(href, "http://ti-kh.org/").href,
      text,
      detail: await detail(href),
    });

  }

  return items;
}


await root();