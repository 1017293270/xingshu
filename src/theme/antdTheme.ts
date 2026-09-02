import type { ThemeConfig } from "antd";
import { xingshuTokens } from "./xingshuTokens";

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: xingshuTokens.colorPrimary,
    colorBgLayout: xingshuTokens.colorBg,
    colorBgContainer: xingshuTokens.colorSurface,
    colorBgMask: "rgba(8, 26, 58, 0.45)",
    colorText: xingshuTokens.colorText,
    colorTextSecondary: xingshuTokens.colorTextSecondary,
    colorTextTertiary: xingshuTokens.colorTextTertiary,
    colorBorder: xingshuTokens.colorBorder,
    colorSuccess: xingshuTokens.colorSuccess,
    colorWarning: xingshuTokens.colorWarning,
    colorError: xingshuTokens.colorDanger,
    borderRadius: xingshuTokens.radiusControl,
    borderRadiusLG: xingshuTokens.radiusCard,
    borderRadiusSM: xingshuTokens.radiusSmall,
    fontFamily: xingshuTokens.fontFamily,
    controlHeight: xingshuTokens.controlHeight,
    controlHeightLG: xingshuTokens.controlHeightLarge,
    controlHeightSM: xingshuTokens.controlHeightSmall,
    motionUnit: xingshuTokens.motionFast / 1000,
    motionBase: 0
  },
  components: {
    Button: {
      borderRadius: xingshuTokens.radiusControl,
      controlHeight: xingshuTokens.controlHeight,
      controlHeightLG: xingshuTokens.controlHeightLarge,
      controlHeightSM: xingshuTokens.controlHeightSmall,
      // 控件文字统一停在 500：加粗留给标题与数值，一屏十几个按钮全是粗体就没有主次
      fontWeight: 500,
      primaryShadow: xingshuTokens.shadowButton,
      defaultShadow: "none",
      dangerShadow: xingshuTokens.shadowButton,
      // 实心按钮用更深的品牌蓝：#1677FF 配白字只有 3.4:1，达不到 WCAG AA 正文对比度。
      // 品牌主色仍用于边框、链接、选中态。
      colorPrimary: xingshuTokens.colorPrimaryStrong,
      colorPrimaryHover: xingshuTokens.colorPrimarySolidHover,
      colorPrimaryActive: xingshuTokens.colorPrimarySolidActive
    },
    Card: {
      borderRadiusLG: xingshuTokens.radiusCard
    },
    Input: {
      borderRadius: xingshuTokens.radiusControl,
      activeBorderColor: xingshuTokens.colorBorderStrong,
      hoverBorderColor: xingshuTokens.colorBorderStrong
    },
    Layout: {
      siderBg: xingshuTokens.colorSurface,
      lightSiderBg: xingshuTokens.colorSurface,
      triggerBg: xingshuTokens.colorSurface,
      triggerColor: xingshuTokens.colorTextSecondary
    },
    Menu: {
      itemBorderRadius: xingshuTokens.radiusControl,
      itemBg: "transparent",
      itemColor: xingshuTokens.colorTextSecondary,
      itemHoverBg: "#F5F9FF",
      itemHoverColor: xingshuTokens.colorPrimaryStrong,
      itemSelectedBg: "#EAF3FF",
      itemSelectedColor: xingshuTokens.colorPrimaryStrong,
      subMenuItemBg: "transparent",
      iconSize: 20,
      collapsedIconSize: 20,
      itemHeight: 48,
      itemMarginInline: 0,
      itemMarginBlock: 4
    },
    Segmented: {
      borderRadius: xingshuTokens.radiusControl,
      itemSelectedBg: xingshuTokens.colorSurface,
      // 选中项靠白底＋投影浮起来表达，文字保持墨色：品牌蓝在这里会和主按钮抢一个层级
      itemSelectedColor: xingshuTokens.colorText,
      itemColor: xingshuTokens.colorTextSecondary,
      trackBg: xingshuTokens.colorSurfaceSoft,
      trackPadding: 2
    },
    Tag: {
      borderRadiusSM: xingshuTokens.radiusSmall,
      defaultBg: "#EAF3FF",
      defaultColor: xingshuTokens.colorPrimaryStrong
    },
    Alert: {
      borderRadiusLG: xingshuTokens.radiusCard
    }
  }
};
