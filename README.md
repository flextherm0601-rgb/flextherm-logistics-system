# Flextherm 国际物流实时报价系统

这是一个用于计算产品货量，并通过4PX和Easyship API获取实时物流报价的网页工具。

## 系统组成

* `index.html`：报价系统网页
* `shipping-proxy-worker.js`：Cloudflare Worker接口代理
* `README.md`：部署和使用说明

## 已部署的Cloudflare Worker

Worker地址：

```text
https://flextherm-shipping.flextherm0601.workers.dev
```

接口状态检查：

```text
https://flextherm-shipping.flextherm0601.workers.dev/api/health
```

正常情况下应当返回：

```json
{
  "ok": true,
  "provider": "4PX + Easyship",
  "configured": true,
  "fourpxConfigured": true,
  "easyshipConfigured": true
}
```

## Cloudflare环境变量

以下API密钥保存在Cloudflare Worker的Secrets中，禁止直接写入网页或上传到GitHub：

```text
FOURPX_APP_KEY
FOURPX_SECRET_KEY
EASYSHIP_TOKEN
```

任何API密钥、Secret Key和Token都不得提交到本GitHub仓库。

## GitHub Pages部署方法

### 1. 确认网页文件名

网页主文件必须命名为：

```text
index.html
```

不能使用：

```text
index (2).html
```

否则GitHub Pages无法自动找到网站首页。

### 2. 开启GitHub Pages

进入GitHub仓库：

```text
Settings → Pages
```

在“Build and deployment”中设置：

```text
Source：Deploy from a branch
Branch：main
Folder：/ (root)
```

点击：

```text
Save
```

等待大约1至5分钟，GitHub会生成网站地址。

网站地址通常为：

```text
https://你的GitHub用户名.github.io/仓库名称/
```

### 3. 网页实时接口设置

打开报价网页后，展开：

```text
实时报价设置
```

4PX服务地址填写：

```text
https://flextherm-shipping.flextherm0601.workers.dev
```

Easyship代理地址填写：

```text
https://flextherm-shipping.flextherm0601.workers.dev
```

Easyship令牌可以留空，因为令牌已经安全保存在Cloudflare Worker中。

澳大利亚悉尼测试邮编可以填写：

```text
2000
```

点击“保存并刷新报价”，系统将尝试查询实时运费。

## API接口

### 状态检查

```text
GET /api/health
```

### 4PX实时试算

```text
POST /api/4px/quote
```

### Easyship实时运价

```text
POST /api/es/rates
```

## 常见问题

### 网页显示404

确认GitHub仓库中的首页文件名称为：

```text
index.html
```

### 4PX显示未配置

检查Cloudflare Worker是否存在：

```text
FOURPX_APP_KEY
FOURPX_SECRET_KEY
```

### Easyship显示未配置

检查Cloudflare Worker是否存在：

```text
EASYSHIP_TOKEN
```

### Easyship返回401或403

Easyship Token可能错误、失效，或者没有：

```text
public.rate:read
```

权限。

### Easyship返回402

当前Easyship订阅可能不支持Rates API，需要检查Easyship Subscription。

### 4PX没有返回报价

可能原因包括：

* 4PX账号没有开通澳大利亚渠道
* App Key没有预估费用查询权限
* 邮编、重量或尺寸不符合渠道要求
* 4PX账号需要其他授权方式

## 安全提示

严禁把以下内容放入GitHub代码：

* 4PX App Key的真实值
* 4PX Secret Key的真实值
* Easyship Token的真实值
* Cloudflare账户密码
* Easyship或4PX登录密码

所有密钥只能保存在Cloudflare Worker的Secrets中。
