import { expect, it } from 'vitest';
import {buildOfficialDocumentReferenceWritingPlan,parseOfficialDocumentReferenceGeneration,parseOfficialDocumentFullDraft,reviewOfficialDocumentDraftFacts} from '@/services/officialDocumentFullDraft';
import type {OfficialDocumentWritingLogicPlan,OfficialDocumentContentProfile,OfficialDocumentResearchResult,OfficialDocumentStructureNode} from '@/types/officialDocument';
const section=(id:string,title:string,headingRole:'HEADING_1'|'HEADING_2'='HEADING_1',purpose='说明本节内容')=>({id,title,headingRole,purpose,order:0,keyPoints:[],sourceBlockIds:[]});
const logic=(sections:ReturnType<typeof section>[]):OfficialDocumentWritingLogicPlan=>({summary:'写作方案',sections:sections.map((s,order)=>({...s,order})),researchNeeds:[],unassignedSourceBlockIds:[],warnings:[]});
const profile=(plan:OfficialDocumentWritingLogicPlan):OfficialDocumentContentProfile=>({id:'p',templateId:'t',templateVersionId:'v',name:'方案',originalFileName:'source.docx',originalSize:1,status:'CONFIRMED',createdBy:'u',createdAt:'',updatedAt:'',profile:{source:{sourceSha256:'test',blocks:[],warnings:[]},confirmedPlan:plan}});
const refPlan=(plan:OfficialDocumentWritingLogicPlan)=>buildOfficialDocumentReferenceWritingPlan({referenceDraft:{id:'t',title:'写作模板',templateName:'报告'},content:{revision:0,fixedValues:[],blocks:[]},templateNodes:[],userRequirement:'请写报告',confirmedPlan:plan});
const parseRef=(raw:string,plan:OfficialDocumentWritingLogicPlan,researchResults:OfficialDocumentResearchResult[]=[])=>{const p=refPlan(plan);return parseOfficialDocumentReferenceGeneration({markdown:raw,referenceDraftTitle:'报告',sections:p.sections,fixedFields:[],templateNodes:[],researchResults});};

it('title-only opening plus substantive sibling section remains an editable report',()=>{
 const p=logic([section('title','本季度服务报告','HEADING_1','作为整篇报告的标题'),section('body','一、服务情况')]);
 const raw='[[XS_SECTION:title]]\n# 本季度服务报告\n[[XS_SECTION:body]]\n# 一、服务情况\n本季度已完成服务交付。';
 expect(()=>parseRef(raw,p)).not.toThrow();
 expect(parseRef(raw,p).blocks.some(b=>b.text.includes('已完成服务交付'))).toBe(true);
});
it('full draft accepts an empty parent heading with a populated child',()=>{
 const p=logic([section('parent','一、工作进展'),section('child','（一）完成情况','HEADING_2')]);
 const raw='[[XS_SECTION:parent]]\n# 一、工作进展\n[[XS_SECTION:child]]\n## （一）完成情况\n实际工作已经完成。';
 expect(()=>parseOfficialDocumentFullDraft({markdown:raw,profile:profile(p),results:[],templateNodes:[]})).not.toThrow();
});
it.each(['reference','full'])('research table and chart remain content without prose in %s parser',kind=>{
 const p=logic([section('data','一、数据图表')]);
 const result:OfficialDocumentResearchResult={taskId:'r',sectionId:'data',kind:'ASK_DATA',question:'返回数据图表',required:true,preferredOutput:'TABLE',status:'SUCCESS',summary:'',table:{columns:['指标'],rows:[['3']],totalRows:1},chart:{mimeType:'image/png',base64:'fixture',widthPx:1,heightPx:1,altText:'图表'},querySource:{kind:'QUERY_ASSET',queryAssetId:'a',queryVersionId:'v',outputKey:'o'},citations:[]};
 const raw='[[XS_SECTION:data]]\n# 一、数据图表';
 const parsed=()=>kind==='reference'?parseRef(raw,p,[result]):parseOfficialDocumentFullDraft({markdown:raw,profile:profile(p),results:[result],templateNodes:[]});
 expect(parsed).not.toThrow();
 expect(parsed().blocks.map(b=>b.role)).toEqual(expect.arrayContaining(['TABLE','CHART_IMAGE']));
});
it.each(['reference','full'])('ordinary Markdown without markers stays editable in %s parser',kind=>{
 const p=logic([section('body','正文')]);
 const raw='# 新报告标题\n## 工作进展\n已完成第一阶段。\n## 后续安排\n下月继续推进。';
 const parsed=()=>kind==='reference'?parseRef(raw,p):parseOfficialDocumentFullDraft({markdown:raw,profile:profile(p),results:[],templateNodes:[]});
 expect(parsed).not.toThrow();
 expect(parsed().blocks.map(b=>b.text).join('\n')).toContain('已完成第一阶段');
 expect(parsed().blocks.map(b=>b.text).join('\n')).toContain('下月继续推进');
});

const title = "关于2025年咨询合作项目合同履约情况的报告";
const sampleNodes: OfficialDocumentStructureNode[] = [
 { id:"title",order:0,role:"TITLE",roleLabel:"标题",slotId:"title-slot",slotType:"FIXED_TEXT",preview:"关于咨询合作项目合同履约情况的报告",editable:true,dataBinding:false,required:false,styleSummary:[],variantId:"title" },
 { id:"h1",order:1,role:"HEADING_1",roleLabel:"一级标题",preview:"一、合同基本情况",editable:true,dataBinding:false,required:false,styleSummary:[],variantId:"h1" },
 { id:"body",order:2,role:"BODY",roleLabel:"正文",preview:"正文",editable:true,dataBinding:false,required:false,styleSummary:[],variantId:"body" }
];
const samplePlan: OfficialDocumentWritingLogicPlan = { summary:"", sections:[
 {id:"section-1",order:0,headingRole:"HEADING_1",title,purpose:"作为整篇报告的标题，明确报告年度为2025年",keyPoints:[],sourceBlockIds:[]},
 {id:"section-2",order:1,headingRole:"HEADING_1",title:"报告引言",purpose:"介绍报告期与主要安排",keyPoints:[],sourceBlockIds:[]},
 {id:"section-3",order:2,headingRole:"HEADING_1",title:"一、合同基本情况",purpose:"介绍合同基本情况",keyPoints:[],sourceBlockIds:[]}
 ],researchNeeds:[],unassignedSourceBlockIds:[],warnings:[] };
const oldSections = samplePlan.sections.map(section=>({...section,bodyRequired:true}));
const markdown = ["[[XS_FIXED:title-slot]]","关于咨询合作项目合同履约情况的报告","[[XS_SECTION:section-1]]",`# ${title}`,"[[XS_SECTION:section-2]]","# 报告引言","公司领导：","现就2025年度履约情况报告如下。","[[XS_SECTION:section-3]]","# 一、合同基本情况","合同履约内容已经写出。"].join("\n\n");
it("keeps the report title separate and recovers the fully written body from the old plan",()=>{
 const generated=parseOfficialDocumentReferenceGeneration({markdown,referenceDraftTitle:"知识库合同履约情况报告模板",sections:oldSections,fixedFields:[{slotId:"title-slot",role:"TITLE",roleLabel:"标题",preview:sampleNodes[0].preview,required:false}],templateNodes: sampleNodes});
 expect(generated.title).toBe(title);
 expect(generated.fixedValues[0].value).toBe(title);
 expect(generated.blocks.map(block=>block.text)).toContain("合同履约内容已经写出。");
 expect(generated.blocks.filter(block=>block.text===title)).toHaveLength(0);
});
it("does not require the document title to be a body section in new writing requests",()=>{
 const plan=buildOfficialDocumentReferenceWritingPlan({referenceDraft:{id:"template",title:"知识库合同履约情况报告模板",templateName:"报告模板"},content:{revision:0,fixedValues:[],blocks:[]},templateNodes: sampleNodes,userRequirement:"帮我写个2025年的履约情况，全部mock",confirmedPlan: samplePlan});
 expect(plan.sections.map(section=>section.id)).toEqual(["section-2","section-3"]);
});

it('reports a whole date once instead of its overlapping year month and day', () => {
  const issues = reviewOfficialDocumentDraftFacts('落款日期：2026年9月2日。', { sourceBlocks: [{ text: '请形成合同履约报告。' }] });
  expect(issues[0]?.additions).toEqual(['2026年9月2日']);
});
it('retains separate whole dates and independent quantities without date fragments', () => {
  const issues = reviewOfficialDocumentDraftFacts('合同期限为2025年1月1日至2025年12月31日，涉及五个服务事项。', { sourceBlocks: [{ text: '请形成合同履约报告。' }] });
  expect(issues[0]?.additions).toEqual(['2025年1月1日', '2025年12月31日', '五个']);
});
it('recognizes the same date when it is supplied in the trusted source facts', () => {
  const issues = reviewOfficialDocumentDraftFacts('落款日期：2026年9月2日。', { sourceBlocks: [{ text: '落款日期为2026年9月2日。' }] });
  expect(issues).toEqual([]);
});

it('recognizes a supplied date when later wording mentions just its year', () => {
 expect(reviewOfficialDocumentDraftFacts('该事项在2026年完成。', {sourceBlocks:[{text:'事项于2026年9月2日完成。'}]})).toEqual([]);
});
it.each(['', '   ', '[[XS_SECTION:body]]'])('does not manufacture a document from empty output', raw => {
 const p=logic([section('body','正文')]);
 expect(() => parseRef(raw,p)).toThrow('没有可整理的正文');
 expect(() => parseOfficialDocumentFullDraft({markdown:raw,profile:profile(p),results:[],templateNodes:[]})).toThrow('没有可整理的正文');
});
it.each([
 '[[XS_SECTION:two]]\n# 二、安排\n安排正文。\n[[XS_SECTION:one]]\n# 一、情况\n情况正文。',
 '[[XS_SECTION:one]]\n# 一、情况\n第一段正文。\n[[XS_SECTION:one]]\n第二段正文。'
])('preserves every text segment when anchors are reordered or duplicated', raw => {
 const p=logic([section('one','一、情况'),section('two','二、安排')]);
 const result=parseRef(raw,p).blocks.map(block=>block.text).join('\n');
 for(const sentence of raw.split('\n').filter(line=>line.endsWith('。'))) expect(result).toContain(sentence);
 expect(result).not.toContain('[[XS_');
});

it.each([
 '引言也要保留。\n[[XS_SECTION:body]]\n# 正文\n主要内容。',
 '[[XS_FIXED:title-slot]]\n报告标题\n遗漏在固定字段后的正文也要保留。\n[[XS_SECTION:body]]\n# 正文\n主要内容。'
])('retains text outside the expected anchor layout', raw => {
 const result=parseOfficialDocumentReferenceGeneration({markdown:raw,referenceDraftTitle:'报告',sections:[{id:'body',order:0,title:'正文',headingRole:'HEADING_1',bodyRequired:true}],fixedFields:[{slotId:'title-slot',role:'TITLE',roleLabel:'标题',preview:'',required:false}],templateNodes:sampleNodes});
 const text=result.blocks.map(block=>block.text).join('\n');
 for(const line of raw.split('\n').filter(line=>line.endsWith('。'))) expect(text).toContain(line);
});

it('preserves generated text even when the content plan has no sections', () => {
 const result=parseOfficialDocumentFullDraft({markdown:'这是没有分节的完整正文。',profile:profile(logic([])),results:[],templateNodes:[]});
 expect(result.blocks.map(block=>block.text)).toEqual(['这是没有分节的完整正文。']);
});
