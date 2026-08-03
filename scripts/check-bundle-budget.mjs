import { createGzip } from "node:zlib";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import path from "node:path";

const assetsDirectory = path.resolve("dist/assets");

if (!existsSync(assetsDirectory)) {
  console.error("未找到 dist/assets。请先运行 npm run build。");
  process.exit(1);
}

async function gzipSize(filePath) {
  let size = 0;
  await pipeline(
    createReadStream(filePath),
    createGzip(),
    new Writable({
      write(chunk, _encoding, callback) {
        size += chunk.length;
        callback();
      }
    })
  );
  return size;
}

const files = readdirSync(assetsDirectory);
const budgets = [
  { label: "主入口", pattern: /^index-[\w-]+\.js$/, limitKb: 220 },
  { label: "图表运行时", pattern: /^echartsRuntime-[\w-]+\.js$/, limitKb: 250 }
];

let failed = false;
for (const budget of budgets) {
  const file = files.find((candidate) => budget.pattern.test(candidate));
  if (!file) {
    console.error(`${budget.label}产物不存在：${budget.pattern}`);
    failed = true;
    continue;
  }

  const bytes = await gzipSize(path.join(assetsDirectory, file));
  const sizeKb = bytes / 1024;
  const result = `${budget.label} ${sizeKb.toFixed(1)}KB gzip / 预算 ${budget.limitKb}KB`;
  if (sizeKb > budget.limitKb) {
    console.error(`超出包体预算：${result}`);
    failed = true;
  } else {
    console.log(`通过：${result}`);
  }
}

if (failed) {
  process.exitCode = 1;
}
