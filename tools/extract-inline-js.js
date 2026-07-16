#!/usr/bin/env node
// يسحب كل <script> من غير src من index.html ويعمل node --check عليه —
// شبكة أمان بسيطة ضد أخطاء syntax قبل ما توصل للمستخدمين (الملف واحد ضخم
// وservice worker بيحدّثه فورًا (network-first) لكل الأجهزة، فأي syntax error
// بتكسر التطبيق بالكامل عند كل عميل فورًا).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const indexPath = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(indexPath, "utf8");

const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let match;
const chunks = [];
while ((match = scriptRe.exec(html))) chunks.push(match[1]);

if (chunks.length === 0) {
  console.error("No inline <script> blocks found in index.html — check the extraction pattern.");
  process.exit(1);
}

const outPath = path.join(require("os").tmpdir(), "fatorty-extracted.js");
fs.writeFileSync(outPath, chunks.join("\n;\n"));

try {
  execFileSync(process.execPath, ["--check", outPath], { stdio: "inherit" });
  console.log(`OK — ${chunks.length} inline script block(s), syntax valid.`);
} catch (e) {
  console.error("Syntax check FAILED — see error above.");
  process.exit(1);
}
