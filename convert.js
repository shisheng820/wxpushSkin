#!/usr/bin/env node
/**
 * HTML to Worker/VPS Converter
 * 将 index.html 转换为 index.js (Cloudflare Worker) 和 index_vps.js (Express)
 *
 * 用法: node convert.js <文件夹路径>
 * 示例: node convert.js warm-magazine
 */

const fs = require('fs');
const path = require('path');

/**
 * 转义模板字符串中的特殊字符
 */
function escapeTemplate(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

/**
 * 将 HTML 内容转换为服务端模板
 */
function convertToTemplate(html) {
  let result = html;

  // 检查是否有 pageTitle
  if (html.includes('id="pageTitle"')) {
    result = result.replace(/<title id="pageTitle">[^<]*<\/title>/, '<title id="pageTitle">${title}</title>');
  } else {
    result = result.replace(/<title>[^<]*<\/title>/, '<title>${title}</title>');
  }

  // 替换 id="title" 的元素内容
  result = result.replace(/(<[^>]*id="title"[^>]*>)[^<]*(<\/[^>]*>)/i, '$1${title}$2');

  // 替换 id="message" 的元素内容
  result = result.replace(/(<[^>]*id="message"[^>]*>)[^<]*(<\/[^>]*>)/i, '$1${message}$2');

  // 替换 id="date" 的元素内容 - 智能处理前缀
  // 例如: <span id="date">timestamp: 无时间信息</span> -> <span id="date">timestamp: ${date}</span>
  const dateMatch = result.match(/(<[^>]*id="date"[^>]*>)([^<]*无时间信息)(<\/[^>]*>)/i);
  if (dateMatch) {
    const prefix = dateMatch[2].replace('无时间信息', '');
    result = result.replace(dateMatch[0], dateMatch[1] + prefix + '${date}' + dateMatch[3]);
  } else {
    result = result.replace(/(<[^>]*id="date"[^>]*>)[^<]*(<\/[^>]*>)/i, '$1${date}$2');
  }

  return result;
}

/**
 * 生成 Cloudflare Worker 格式的 index.js
 */
function generateWorkerJs(html) {
  const templateHtml = convertToTemplate(html);
  const escapedHtml = escapeTemplate(templateHtml);

  return `export default {
  async fetch(request, env, ctx) {
    // 从URL参数中获取数据
    const url = new URL(request.url);
    const title = url.searchParams.get('title') || '消息推送';
    const message = url.searchParams.get('message') || '无告警信息';
    const date = url.searchParams.get('date') || '无时间信息';
    const html = \`${escapedHtml}
\`;
    return new Response(html, {
      headers: {
        'content-type': 'text/html;charset=UTF-8',
      },
    });
  },
};
`;
}

/**
 * 生成 Express.js 格式的 index_vps.js
 */
function generateVpsJs(html) {
  const templateHtml = convertToTemplate(html);
  const escapedHtml = escapeTemplate(templateHtml);

  return `const express = require('express');
const { marked } = require('marked');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 主路由
app.get('/', (req, res) => {
  const url = new URL(req.url, \`http://\${req.headers.host}\`);
  const title = url.searchParams.get('title') || '消息推送';
  const message = url.searchParams.get('message') || '无告警信息';
  const date = url.searchParams.get('date') || '无时间信息';

  const html = \`${escapedHtml}
\`;

  res.send(html);
});

app.listen(PORT, () => {
  console.log(\`服务器运行在 http://localhost:\${PORT}\`);
});
`;
}

/**
 * 列出可用的文件夹
 */
function listAvailableFolders() {
  const dirs = fs.readdirSync('.', { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const available = [];
  dirs.forEach(dir => {
    const htmlPath = path.join(dir, 'index.html');
    if (fs.existsSync(htmlPath)) {
      const jsPath = path.join(dir, 'index.js');
      const vpsPath = path.join(dir, 'index_vps.js');
      const status = [];
      if (!fs.existsSync(jsPath)) status.push('缺 index.js');
      if (!fs.existsSync(vpsPath)) status.push('缺 index_vps.js');
      available.push({
        name: dir,
        complete: status.length === 0,
        status: status.join(', ')
      });
    }
  });
  return available;
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('用法: node convert.js <文件夹路径>');
    console.log('示例: node convert.js warm-magazine');
    console.log('');
    console.log('可用文件夹:');

    const folders = listAvailableFolders();
    folders.forEach(f => {
      const statusStr = f.complete ? '(已完成)' : '(' + f.status + ')';
      console.log('  - ' + f.name + ' ' + statusStr);
    });

    process.exit(1);
  }

  const folderPath = args[0];
  const htmlPath = path.join(folderPath, 'index.html');
  const workerPath = path.join(folderPath, 'index.js');
  const vpsPath = path.join(folderPath, 'index_vps.js');

  if (!fs.existsSync(folderPath)) {
    console.error('错误: 文件夹 "' + folderPath + '" 不存在');
    process.exit(1);
  }

  if (!fs.existsSync(htmlPath)) {
    console.error('错误: "' + htmlPath + '" 不存在');
    process.exit(1);
  }

  console.log('正在处理: ' + folderPath);

  const html = fs.readFileSync(htmlPath, 'utf-8');

  const workerJs = generateWorkerJs(html);
  fs.writeFileSync(workerPath, workerJs);
  console.log('✓ 已生成: ' + workerPath);

  const vpsJs = generateVpsJs(html);
  fs.writeFileSync(vpsPath, vpsJs);
  console.log('✓ 已生成: ' + vpsPath);

  console.log(folderPath + ' 转换完成！');
}

main();
