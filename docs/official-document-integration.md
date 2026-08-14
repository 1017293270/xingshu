# 公文写作集成说明

星数前端只负责模板库、模板校准、结构化草稿、QueryAsset 绑定和 PDF 预览。DOCX 解析、模板编译、数据冻结、文件生成和持久化均由同级独立服务 `official-document-service` 承担。

## 当前链路

```text
/writing
  → 同源 /api/official-document 网关
  → official-document-service
  → Syncfusion DocIO 34.1.33（DOCX 分析、编译、生成）
  → LibreOffice Headless（PDF）
  → analytics-service（QueryAsset）
  → MySQL official_document + /data/objects
```

生产模式固定使用线上 API。接口失败时页面显示真实错误，不回退演示数据；只有测试或明确设置 `VITE_OFFICIAL_DOCUMENT_API_MODE=demo` 时才启用本地演示适配器。

当前试点网关允许已登录成员管理自己空间内的模板，系统管理员限制仍可通过后端 `GATEWAY_TEMPLATE_WRITE_POLICY=system-admin` 恢复。前端不得把普通成员显示为管理员。

## 页面组成

- 模板库：上传 `.docx`、查看分析进度、原稿 PDF 和风险。
- 模板校准：确认标题、主送、一级至三级标题、正文、附件、落款、日期和版记；设置正文区域起止位置以及表格绑定槽位。
- 草稿列表：从已发布模板创建草稿并恢复历史内容。
- 结构化编辑器：左侧层级树，中间固定字段与正文节点，右侧 QueryAsset 和 PDF 预览。
- 导出：分别生成 DOCX 和 PDF，下载文件与导出记录来自真实后端。

## 草稿保存

前端每 600ms 防抖提交完整 `fixedValues + blocks`，并携带 `expectedRevision`。后端返回新 revision 后更新本地基线；冲突或请求失败会显示“保存失败”，不会假装已保存。

节点支持：

- 新增一级标题、二级标题、三级标题或正文。
- 删除、上移、下移。
- 切换角色和格式变体。
- 编辑标题、主送、附件说明、落款和日期等固定字段。

## QueryAsset 绑定

绑定仅使用已经保存的 QueryAsset 和固定 QueryVersion：

- `SCALAR`：指定列，默认取第一行。
- `FACT_SUMMARY`：指定文字或数值列，并应用前后缀格式。
- `TABLE`：选择最多 10 列，冻结最多 50 行。

创建绑定后状态为 `STALE`，只有用户点击刷新才执行线上查询。刷新成功后页面展示 executionId 和 snapshotId；解除绑定会保留当前值并将状态改为 `MANUAL`。

analytics 未提供 snapshotId 时，由公文服务生成 `preview-{uuid}` 本地快照标识；输出行按 `columnId` / `key` 双重映射。

## 环境变量

前端只需要公文 API 地址和模式：

```text
VITE_OFFICIAL_DOCUMENT_API_BASE_URL=/api/official-document
VITE_OFFICIAL_DOCUMENT_API_MODE=gateway
```

Syncfusion license、数据库凭据、服务间 HMAC 和 QueryAsset 内网地址都只存在于后端部署环境，不进入 Vite 构建产物。

## 当前能力与限制

- 后台 Word 引擎为 Syncfusion DocIO；缺少许可证时能力接口明确返回不可用。
- PDF 由同一公文服务容器中的 LibreOffice 生成。
- ONLYOFFICE 组件与接口代码保留用于回退，但 `/writing` 不加载编辑器、不创建会话。
- Aspose 适配器代码保留但生产不启用。
- 第一版不支持 AI 起草、多人协同、审批、图表写入或复杂 Word 对象编辑。
