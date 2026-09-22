import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('standalone site has required views and relative assets',()=>{
  const html=fs.readFileSync('docs/index.html','utf8');
  for(const label of ['AI更新迭代','海外AI课程','AI新闻播报','我的资料库','设置']) assert.match(html,new RegExp(label));
  assert.match(html,/\.\/styles\.css/);assert.match(html,/\.\/app\.js/);
  assert.match(html,/\.\/data\/feed-data\.js/);
});

test('website never embeds a DeepSeek secret',()=>{
  for(const file of ['docs/index.html','docs/app.js','docs/styles.css','docs/data/feed.json','docs/data/feed-data.js']){
    const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/sk-[a-z0-9]{12,}/i);
  }
});

test('local file mode has an inline data snapshot',()=>{
  const text=fs.readFileSync('docs/data/feed-data.js','utf8');
  assert.match(text,/^window\.__AI_RADAR_DATA__=/);
  assert.doesNotMatch(fs.readFileSync('docs/index.html','utf8'),/type="module"/);
});

test('initial feed has a stable schema',()=>{
  const feed=JSON.parse(fs.readFileSync('docs/data/feed.json','utf8'));
  assert.ok(Array.isArray(feed.items));assert.ok(Array.isArray(feed.sourceStatus));assert.ok(Array.isArray(feed.trends));
});
