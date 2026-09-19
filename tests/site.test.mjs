import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('standalone site has required views and relative assets',()=>{
  const html=fs.readFileSync('docs/index.html','utf8');
  for(const label of ['AI更新迭代','海外AI课程','AI新闻播报','我的资料库','设置']) assert.match(html,new RegExp(label));
  assert.match(html,/\.\/styles\.css/);assert.match(html,/\.\/app\.js/);
});

test('website never embeds a DeepSeek secret',()=>{
  for(const file of ['docs/index.html','docs/app.js','docs/styles.css','docs/data/feed.json']){
    const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/sk-[a-z0-9]{12,}/i);
  }
});

test('initial feed has a stable schema',()=>{
  const feed=JSON.parse(fs.readFileSync('docs/data/feed.json','utf8'));
  assert.ok(Array.isArray(feed.items));assert.ok(Array.isArray(feed.sourceStatus));assert.ok(Array.isArray(feed.trends));
});
