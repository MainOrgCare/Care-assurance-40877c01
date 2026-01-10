import JSZip from "jszip";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * @typedef {{ text: string; level: number; bold?: boolean }} Bullet
 * @typedef {{ title: string; subtitle?: string; bullets?: Bullet[]; compact?: boolean }} Slide
 */

const SLIDE_WIDTH = 12192000; // 13.333in * 914400
const SLIDE_HEIGHT = 6858000; // 7.5in * 914400

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildContentTypesXml(slideCount) {
  const slideOverrides = Array.from({ length: slideCount }, (_, idx) => {
    const num = idx + 1;
    return `  <Override PartName="/ppt/slides/slide${num}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
${slideOverrides}
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildCoreXml(nowIso) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
>
  <dc:title>Microsoft Copilot vs GPT-5.1</dc:title>
  <dc:creator>CareAssurance</dc:creator>
  <cp:lastModifiedBy>CareAssurance</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppXml(slideCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties
  xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"
>
  <Application>CareAssurance</Application>
  <PresentationFormat>Widescreen</PresentationFormat>
  <Slides>${slideCount}</Slides>
  <Company></Company>
  <AppVersion>16.0000</AppVersion>
</Properties>`;
}

function buildPresentationXml(slideCount) {
  const slideIds = Array.from({ length: slideCount }, (_, idx) => {
    const id = 256 + idx;
    const relId = 2 + idx;
    return `    <p:sldId id="${id}" r:id="rId${relId}"/>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
>
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
${slideIds}
  </p:sldIdLst>
  <p:sldSz cx="${SLIDE_WIDTH}" cy="${SLIDE_HEIGHT}" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle>
    <a:defPPr>
      <a:defRPr lang="en-GB"/>
    </a:defPPr>
  </p:defaultTextStyle>
</p:presentation>`;
}

function buildPresentationRelsXml(slideCount) {
  const slideRels = Array.from({ length: slideCount }, (_, idx) => {
    const relId = 2 + idx;
    const num = idx + 1;
    return `  <Relationship Id="rId${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${num}.xml"/>`;
  }).join("\n");

  const tailStart = 2 + slideCount;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRels}
  <Relationship Id="rId${tailStart}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>
  <Relationship Id="rId${tailStart + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>
  <Relationship Id="rId${tailStart + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>
</Relationships>`;
}

function buildSlideMasterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
>
  <p:cSld>
    <p:bg>
      <p:bgPr>
        <a:solidFill>
          <a:srgbClr val="0B1220"/>
        </a:solidFill>
      </p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="1" r:id="rId1"/>
  </p:sldLayoutIdLst>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr>
        <a:defRPr lang="en-GB" sz="4400" b="1">
          <a:solidFill><a:srgbClr val="F8FAFC"/></a:solidFill>
        </a:defRPr>
      </a:lvl1pPr>
    </p:titleStyle>
    <p:bodyStyle>
      <a:lvl1pPr marL="457200" indent="-228600">
        <a:buChar char="•"/>
        <a:defRPr lang="en-GB" sz="2200">
          <a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill>
        </a:defRPr>
      </a:lvl1pPr>
      <a:lvl2pPr marL="914400" indent="-228600">
        <a:buChar char="•"/>
        <a:defRPr lang="en-GB" sz="2000">
          <a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill>
        </a:defRPr>
      </a:lvl2pPr>
    </p:bodyStyle>
    <p:otherStyle>
      <a:lvl1pPr>
        <a:defRPr lang="en-GB" sz="1600">
          <a:solidFill><a:srgbClr val="94A3B8"/></a:solidFill>
        </a:defRPr>
      </a:lvl1pPr>
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>`;
}

function buildSlideMasterRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;
}

function buildSlideLayoutXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  type="blank"
  preserve="1"
>
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;
}

function buildSlideLayoutRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
}

function buildThemeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CareAssurance Theme">
  <a:themeElements>
    <a:clrScheme name="CareAssurance">
      <a:dk1><a:srgbClr val="0B1220"/></a:dk1>
      <a:lt1><a:srgbClr val="F8FAFC"/></a:lt1>
      <a:dk2><a:srgbClr val="0F172A"/></a:dk2>
      <a:lt2><a:srgbClr val="E2E8F0"/></a:lt2>
      <a:accent1><a:srgbClr val="2563EB"/></a:accent1>
      <a:accent2><a:srgbClr val="14B8A6"/></a:accent2>
      <a:accent3><a:srgbClr val="22C55E"/></a:accent3>
      <a:accent4><a:srgbClr val="F59E0B"/></a:accent4>
      <a:accent5><a:srgbClr val="E11D48"/></a:accent5>
      <a:accent6><a:srgbClr val="8B5CF6"/></a:accent6>
      <a:hlink><a:srgbClr val="60A5FA"/></a:hlink>
      <a:folHlink><a:srgbClr val="A78BFA"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="CareAssurance">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="CareAssurance">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="accent1"/></a:gs>
            <a:gs pos="100000"><a:schemeClr val="accent2"/></a:gs>
          </a:gsLst>
          <a:lin ang="16200000" scaled="1"/>
        </a:gradFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="accent2"/></a:gs>
            <a:gs pos="100000"><a:schemeClr val="accent1"/></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="1"/>
        </a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
          <a:prstDash val="solid"/>
          <a:miter lim="800000"/>
        </a:ln>
        <a:ln w="12700" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
          <a:prstDash val="solid"/>
          <a:miter lim="800000"/>
        </a:ln>
        <a:ln w="19050" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
          <a:prstDash val="solid"/>
          <a:miter lim="800000"/>
        </a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="dk1"/></a:solidFill>
        <a:solidFill><a:schemeClr val="lt1"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>`;
}

function buildPresPropsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`;
}

function buildViewPropsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:viewPr
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
>
  <p:normalViewPr/>
  <p:slideViewPr>
    <p:cSldViewPr>
      <p:cViewPr/>
      <p:guideLst/>
    </p:cSldViewPr>
  </p:slideViewPr>
</p:viewPr>`;
}

function buildTableStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:tblStyleLst
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"
/>`;
}

function buildSlideRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
}

function buildTextShapeXml({ id, name, x, y, cx, cy, paragraphsXml }) {
  return `
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="${id}" name="${escapeXml(name)}"/>
        <p:cNvSpPr txBox="1"/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="${x}" y="${y}"/>
          <a:ext cx="${cx}" cy="${cy}"/>
        </a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:noFill/>
        <a:ln><a:noFill/></a:ln>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square" rtlCol="0" anchor="t"/>
        <a:lstStyle/>
${paragraphsXml}
      </p:txBody>
    </p:sp>`;
}

function buildTitleParagraphXml(text, size) {
  return `        <a:p>
          <a:r>
            <a:rPr lang="en-GB" sz="${size}" b="1">
              <a:solidFill><a:srgbClr val="F8FAFC"/></a:solidFill>
            </a:rPr>
            <a:t>${escapeXml(text)}</a:t>
          </a:r>
          <a:endParaRPr lang="en-GB"/>
        </a:p>`;
}

function buildSubtitleParagraphXml(text, size) {
  return `        <a:p>
          <a:r>
            <a:rPr lang="en-GB" sz="${size}">
              <a:solidFill><a:srgbClr val="94A3B8"/></a:solidFill>
            </a:rPr>
            <a:t>${escapeXml(text)}</a:t>
          </a:r>
          <a:endParaRPr lang="en-GB"/>
        </a:p>`;
}

function buildBulletParagraphXml(bullet, baseFontSize) {
  const lvl = Math.max(0, Math.min(4, bullet.level));
  const marL = lvl === 0 ? 457200 : lvl === 1 ? 914400 : 1371600;
  const indent = -228600;
  const fontSize = lvl === 0 ? baseFontSize : baseFontSize - 200;
  const weightAttr = bullet.bold ? ` b="1"` : "";
  const color = bullet.bold ? "E2E8F0" : "CBD5E1";

  return `        <a:p>
          <a:pPr lvl="${lvl}" marL="${marL}" indent="${indent}">
            <a:buChar char="•"/>
          </a:pPr>
          <a:r>
            <a:rPr lang="en-GB" sz="${fontSize}"${weightAttr}>
              <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
            </a:rPr>
            <a:t>${escapeXml(bullet.text)}</a:t>
          </a:r>
          <a:endParaRPr lang="en-GB"/>
        </a:p>`;
}

function buildFooterParagraphXml(text, align, size) {
  const algn = align === "r" ? "r" : "l";
  return `        <a:p>
          <a:pPr algn="${algn}"/>
          <a:r>
            <a:rPr lang="en-GB" sz="${size}">
              <a:solidFill><a:srgbClr val="64748B"/></a:solidFill>
            </a:rPr>
            <a:t>${escapeXml(text)}</a:t>
          </a:r>
          <a:endParaRPr lang="en-GB"/>
        </a:p>`;
}

function buildSlideXml(slide, slideIndex, slideCount) {
  const marginX = 731520; // 0.8"
  const titleY = 457200; // 0.5"
  const titleH = 914400; // 1.0"
  const bodyY = 1554480; // ~1.7"
  const bodyH = 4300000;
  const footerY = 6480000;
  const footerH = 270000;
  const contentW = SLIDE_WIDTH - marginX * 2;

  const footerLeft = buildTextShapeXml({
    id: 90,
    name: "Footer Left",
    x: marginX,
    y: footerY,
    cx: Math.floor(contentW * 0.6),
    cy: footerH,
    paragraphsXml: buildFooterParagraphXml("CareAssurance", "l", 1200),
  });

  const footerRight = buildTextShapeXml({
    id: 91,
    name: "Footer Right",
    x: marginX + Math.floor(contentW * 0.6),
    y: footerY,
    cx: Math.floor(contentW * 0.4),
    cy: footerH,
    paragraphsXml: buildFooterParagraphXml(`${slideIndex} / ${slideCount}`, "r", 1200),
  });

  if (slideIndex === 1) {
    const titleBox = buildTextShapeXml({
      id: 2,
      name: "Title",
      x: marginX,
      y: 900000,
      cx: contentW,
      cy: 1400000,
      paragraphsXml: buildTitleParagraphXml(slide.title, 5400),
    });

    const subtitleBox = buildTextShapeXml({
      id: 3,
      name: "Subtitle",
      x: marginX,
      y: 2450000,
      cx: contentW,
      cy: 700000,
      paragraphsXml: buildSubtitleParagraphXml(slide.subtitle ?? "", 2200),
    });

    const badgeBox = buildTextShapeXml({
      id: 4,
      name: "Badge",
      x: marginX,
      y: 3300000,
      cx: contentW,
      cy: 500000,
      paragraphsXml: buildSubtitleParagraphXml("Security • Governance • Effectiveness • Fit", 1800),
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
>
  <p:cSld>
    <p:bg>
      <p:bgPr><a:solidFill><a:srgbClr val="0B1220"/></a:solidFill></p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
${titleBox}
${subtitleBox}
${badgeBox}
${footerLeft}
${footerRight}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
  }

  const titleShape = buildTextShapeXml({
    id: 2,
    name: "Slide Title",
    x: marginX,
    y: titleY,
    cx: contentW,
    cy: titleH,
    paragraphsXml: buildTitleParagraphXml(slide.title, 4200),
  });

  const bulletFontSize = slide.compact ? 1800 : 2000;
  const bulletsXml = (slide.bullets ?? []).map((b) => buildBulletParagraphXml(b, bulletFontSize)).join("\n");

  const bodyShape = buildTextShapeXml({
    id: 3,
    name: "Body",
    x: marginX,
    y: bodyY,
    cx: contentW,
    cy: bodyH,
    paragraphsXml: bulletsXml || buildSubtitleParagraphXml("—", 1800),
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
>
  <p:cSld>
    <p:bg>
      <p:bgPr><a:solidFill><a:srgbClr val="0B1220"/></a:solidFill></p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
${titleShape}
${bodyShape}
${footerLeft}
${footerRight}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

async function generatePptx(slides, outPath) {
  const zip = new JSZip();
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  zip.file("[Content_Types].xml", buildContentTypesXml(slides.length));
  zip.folder("_rels")?.file(".rels", buildRootRelsXml());

  zip.folder("docProps")?.file("core.xml", buildCoreXml(nowIso));
  zip.folder("docProps")?.file("app.xml", buildAppXml(slides.length));

  zip.folder("ppt")?.file("presentation.xml", buildPresentationXml(slides.length));
  zip.folder("ppt")?.folder("_rels")?.file("presentation.xml.rels", buildPresentationRelsXml(slides.length));
  zip.folder("ppt")?.file("presProps.xml", buildPresPropsXml());
  zip.folder("ppt")?.file("viewProps.xml", buildViewPropsXml());
  zip.folder("ppt")?.file("tableStyles.xml", buildTableStylesXml());

  zip.folder("ppt")?.folder("theme")?.file("theme1.xml", buildThemeXml());

  zip.folder("ppt")?.folder("slideMasters")?.file("slideMaster1.xml", buildSlideMasterXml());
  zip.folder("ppt")?.folder("slideMasters")?.folder("_rels")?.file("slideMaster1.xml.rels", buildSlideMasterRelsXml());

  zip.folder("ppt")?.folder("slideLayouts")?.file("slideLayout1.xml", buildSlideLayoutXml());
  zip.folder("ppt")?.folder("slideLayouts")?.folder("_rels")?.file("slideLayout1.xml.rels", buildSlideLayoutRelsXml());

  const slidesFolder = zip.folder("ppt")?.folder("slides");
  const slidesRelsFolder = zip.folder("ppt")?.folder("slides")?.folder("_rels");
  for (let idx = 0; idx < slides.length; idx += 1) {
    const slideNumber = idx + 1;
    slidesFolder?.file(`slide${slideNumber}.xml`, buildSlideXml(slides[idx], slideNumber, slides.length));
    slidesRelsFolder?.file(`slide${slideNumber}.xml.rels`, buildSlideRelsXml());
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  await writeFile(outPath, buffer);
}

/** @type {Slide[]} */
const slides = [
  {
    title: "Microsoft Copilot vs GPT‑5.1",
    subtitle: "Security • Governance • Effectiveness • Fit for Care Workflows",
  },
  {
    title: "Executive Summary",
    bullets: [
      {
        text: "Copilot is strong for internal productivity in Microsoft 365 with enterprise controls and identity baked in.",
        level: 0,
      },
      {
        text: "GPT‑5.1 via API is strong for product‑embedded assistants where you need predictable workflows, structured outputs, and guardrails you control.",
        level: 0,
      },
      {
        text: "The best choice depends on whether the assistant lives inside Microsoft 365 or inside your website.",
        level: 0,
      },
    ],
  },
  {
    title: "What Each Option Is",
    bullets: [
      { text: "Microsoft 365 Copilot", level: 0, bold: true },
      { text: "AI assistant embedded in Microsoft 365 apps (Word, Outlook, Teams, etc.)", level: 1 },
      { text: "Uses your tenant identity/permissions and Microsoft 365 governance stack", level: 1 },
      { text: "GPT‑5.1 via API", level: 0, bold: true },
      { text: "A model you call programmatically from your product", level: 1 },
      { text: "You own orchestration: prompts, tools, retrieval, policies, logging, and UI", level: 1 },
    ],
  },
  {
    title: "Data Flow (High Level)",
    bullets: [
      { text: "Copilot", level: 0, bold: true },
      { text: "User prompt + Microsoft 365 context (documents, emails, meetings) → Copilot response", level: 1 },
      { text: "Access is governed by tenant permissions (who can see what in M365)", level: 1 },
      { text: "GPT‑5.1 via API", level: 0, bold: true },
      { text: "User prompt + our app context (DB, uploads, workflows) → model response", level: 1 },
      { text: "Access is governed by our application permission model and data pipeline", level: 1 },
    ],
  },
  {
    title: "Security & Privacy Controls",
    bullets: [
      { text: "Copilot (Pros)", level: 0, bold: true },
      { text: "Inherits Microsoft 365 security model (identity, conditional access, DLP, eDiscovery, retention)", level: 1 },
      { text: "Admin‑managed controls (tenant policies, auditing)", level: 1 },
      { text: "Copilot (Limitations for a website assistant)", level: 0, bold: true },
      { text: "Not designed as a general, product‑embedded assistant for your own app UI and data flows", level: 1 },
      { text: "Customization is constrained to Microsoft’s orchestration model", level: 1 },
      { text: "GPT‑5.1 via API (Pros)", level: 0, bold: true },
      { text: "Enforce strict app‑level controls: RBAC, scoped retrieval, redaction, retention rules", level: 1 },
      { text: "Build “privacy by design” into exactly what you send (and don’t send) to the model", level: 1 },
      { text: "GPT‑5.1 via API (Responsibilities)", level: 0, bold: true },
      { text: "You implement: permission gates, data minimization, logging/audit trails, key management, incident response", level: 1 },
    ],
    compact: true,
  },
  {
    title: "Governance & Auditability",
    bullets: [
      { text: "Copilot", level: 0, bold: true },
      { text: "Strong tenant‑level governance for M365 content and user activity", level: 1 },
      { text: "Great when the system of record is already Microsoft 365", level: 1 },
      { text: "GPT‑5.1 via API", level: 0, bold: true },
      { text: "Best when you need request/response logs, evaluation harnesses, and reproducible runs", level: 1 },
      { text: "Enables structured outputs + deterministic validation (schemas, rules, policy checks)", level: 1 },
    ],
  },
  {
    title: "Effectiveness for Care Compliance",
    bullets: [
      { text: "What “effective” means here", level: 0, bold: true },
      { text: "High signal‑to‑noise (less hallucination risk)", level: 1 },
      { text: "Domain‑rule alignment (EMAR rules, templates, shift bars, time‑critical constraints)", level: 1 },
      { text: "Consistent formatting and explainability", level: 1 },
      { text: "Copilot", level: 0, bold: true },
      { text: "Optimized for drafting, summarizing, and searching in M365 context", level: 1 },
      { text: "Less optimized for enforcing app‑specific business rules end‑to‑end", level: 1 },
      { text: "GPT‑5.1 via API", level: 0, bold: true },
      { text: "Optimized for product workflows: tool calls, structured outputs, validation loops", level: 1 },
      { text: "Pair with deterministic checks in code before saving/exporting", level: 1 },
    ],
    compact: true,
  },
  {
    title: "Customization & Integration",
    bullets: [
      { text: "Copilot", level: 0, bold: true },
      { text: "Fast adoption where staff already live in Teams/Outlook/Word", level: 1 },
      { text: "Customization depends on Copilot product + tenant capabilities", level: 1 },
      { text: "GPT‑5.1 via API", level: 0, bold: true },
      { text: "Full control over retrieval sources (your DB, uploads, approved docs)", level: 1 },
      { text: "Tooling (EMAR parser, rota optimizer, admin‑only endpoints)", level: 1 },
      { text: "Output contracts (schemas, required fields, severity ratings)", level: 1 },
      { text: "Safety layers (PII filtering, content policies, blocked actions)", level: 1 },
    ],
    compact: true,
  },
  {
    title: "Risk Profile",
    bullets: [
      { text: "Copilot risks", level: 0, bold: true },
      { text: "Scope mismatch (M365 productivity vs app workflows)", level: 1 },
      { text: "Limited ability to enforce precise domain rules", level: 1 },
      { text: "Vendor/product changes you can’t control may affect behavior", level: 1 },
      { text: "GPT‑5.1 via API risks", level: 0, bold: true },
      { text: "Data leakage if you send the wrong context", level: 1 },
      { text: "Misconfiguration (overly broad retrieval, weak auth)", level: 1 },
      { text: "Hallucinations if you don’t constrain outputs and validate", level: 1 },
      { text: "Mitigations for GPT‑5.1", level: 0, bold: true },
      { text: "Strict RAG scoping (only retrieve what the user is allowed to see)", level: 1 },
      { text: "Structured output validation + deterministic rules", level: 1 },
      { text: "Comprehensive audit logging and red‑teaming", level: 1 },
    ],
    compact: true,
  },
  {
    title: "Cost, Scale & Ops",
    bullets: [
      { text: "Copilot", level: 0, bold: true },
      { text: "Often simpler procurement for Microsoft‑first orgs", level: 1 },
      { text: "Best ROI when workflows are already M365‑native", level: 1 },
      { text: "GPT‑5.1 via API", level: 0, bold: true },
      { text: "Cost scales with usage/context size; tune via caching, summarization, policy‑driven context", level: 1 },
      { text: "More engineering effort, but higher long‑term differentiation and control", level: 1 },
    ],
  },
  {
    title: "Recommendation",
    bullets: [
      { text: "Use Microsoft 365 Copilot for internal office productivity (emails, docs, Teams summaries).", level: 0 },
      {
        text: "Use GPT‑5.1 via API for the website assistant where you need predictable workflows, strict RBAC, deterministic validation, and full auditability.",
        level: 0,
      },
      { text: "“Both” is often best: Copilot for M365, GPT for product.", level: 0 },
    ],
  },
  {
    title: "Next Steps (Proof, Not Opinions)",
    bullets: [
      { text: "Define success metrics: accuracy, latency, refusal detection rates, policy violations, reviewer time saved.", level: 0 },
      { text: "Build a red‑team checklist: PII leakage, privilege escalation, prompt injection, unsafe advice.", level: 0 },
      { text: "Run a pilot:", level: 0 },
      { text: "Copilot for internal docs/workflows", level: 1 },
      { text: "GPT‑5.1 for embedded EMAR + rota optimization with guardrails", level: 1 },
      { text: "Review results and pick the operating model.", level: 0 },
    ],
  },
  {
    title: "Appendix: One‑Page Comparison",
    bullets: [
      { text: "Best fit — Copilot: M365 productivity; GPT‑5.1: product workflows in your app", level: 0 },
      { text: "Data context — Copilot: Microsoft Graph/tenant content; GPT‑5.1: your DB/uploads/curated docs", level: 0 },
      { text: "Permissioning — Copilot: inherits M365; GPT‑5.1: you implement RBAC + scoping", level: 0 },
      { text: "Governance — Copilot: strong tenant governance; GPT‑5.1: strong app‑level governance if built", level: 0 },
      { text: "Customization — Copilot: constrained; GPT‑5.1: full control (tools, prompts, schemas)", level: 0 },
      { text: "Auditability — Copilot: M365 auditing; GPT‑5.1: full request/response + eval harness", level: 0 },
      { text: "Risk — Copilot: scope mismatch for app workflows; GPT‑5.1: misconfig if guardrails missing", level: 0 },
      { text: "Engineering effort — Copilot: lower; GPT‑5.1: higher (but more controllable)", level: 0 },
    ],
    compact: true,
  },
];

const out = resolve(process.cwd(), process.argv[2] ?? "COPILOT_VS_GPT51_PRESENTATION.pptx");
await generatePptx(slides, out);
console.log(`Generated ${out}`);

