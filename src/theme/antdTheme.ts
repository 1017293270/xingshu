import type { ThemeConfig } from "antd";
import { xingshuTokens } from "./xingshuTokens";

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: xingshuTokens.colorPrimary,
    colorBgLayout: xingshuTokens.colorBg,
    colorBgContainer: xingshuTokens.colorSurface,
    colorBgMask: xingshuTokens.scrimModal,
    colorBgElevated: xingshuTokens.colorSurface,
    colorText: xingshuTokens.colorText,
    colorTextSecondary: xingshuTokens.colorTextSecondary,
    colorTextTertiary: xingshuTokens.colorTextTertiary,
    colorBorder: xingshuTokens.colorBorder,
    colorBorderSecondary: "#E8EFF8",
    colorFillAlter: xingshuTokens.colorSurfaceSoft,
    colorSuccess: xingshuTokens.colorSuccess,
    colorWarning: xingshuTokens.colorWarning,
    colorError: xingshuTokens.colorDanger,
    borderRadius: xingshuTokens.radiusControl,
    borderRadiusLG: xingshuTokens.radiusCard,
    borderRadiusSM: xingshuTokens.radiusSmall,
    fontFamily: xingshuTokens.fontFamily,
    fontSize: 14,
    fontSizeSM: 12,
    fontWeightStrong: 500,
    lineHeight: 1.5,
    boxShadow: xingshuTokens.shadowOverlay,
    boxShadowSecondary: xingshuTokens.shadowOverlay,
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
      defaultBorderColor: xingshuTokens.colorBorderStrong,
      defaultColor: xingshuTokens.colorText,
      defaultHoverBg: xingshuTokens.colorSurfaceHover,
      defaultHoverBorderColor: xingshuTokens.colorBorderStrong,
      defaultHoverColor: xingshuTokens.colorPrimaryStrong,
      textHoverBg: xingshuTokens.colorSurfaceHover,
      // 实心按钮用更深的品牌蓝：#1677FF 配白字只有 3.4:1，达不到 WCAG AA 正文对比度。
      // 品牌主色仍用于边框、链接、选中态。
      colorPrimary: xingshuTokens.colorPrimaryStrong,
      colorPrimaryHover: xingshuTokens.colorPrimarySolidHover,
      colorPrimaryActive: xingshuTokens.colorPrimarySolidActive
    },
    Card: {
      borderRadiusLG: xingshuTokens.radiusCard,
      headerFontSize: 16,
      bodyPadding: 20
    },
    Input: {
      borderRadius: xingshuTokens.radiusControl,
      activeBorderColor: xingshuTokens.colorPrimaryStrong,
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
      itemHoverBg: xingshuTokens.colorSurfaceHover,
      itemHoverColor: xingshuTokens.colorPrimaryStrong,
      itemSelectedBg: "#EAF3FF",
      itemSelectedColor: xingshuTokens.colorPrimaryStrong,
      subMenuItemBg: "transparent",
      iconSize: 20,
      collapsedIconSize: 20,
      itemHeight: 36,
      itemMarginInline: 0,
      itemMarginBlock: 2
    },
    Segmented: {
      borderRadius: xingshuTokens.radiusControl,
      itemSelectedBg: "#EAF3FF",
      // 选中项通过表面层级表达，主操作保留品牌蓝。
      itemSelectedColor: xingshuTokens.colorPrimaryStrong,
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
    },
    Modal: {
      titleFontSize: 16,
      titleColor: xingshuTokens.colorText,
      contentBg: xingshuTokens.colorSurface,
      headerBg: xingshuTokens.colorSurface,
      borderRadiusLG: 18
    },
    Drawer: {
      fontSizeLG: 16
    },
    Dropdown: {
      fontSize: 13,
      controlHeight: 32,
      borderRadiusLG: 12,
      controlItemBgHover: xingshuTokens.colorSurfaceHover
    },
    Tooltip: {
      fontSize: 12,
      borderRadius: 8
    },
    Table: {
      headerBg: xingshuTokens.colorSurfaceSoft,
      headerColor: xingshuTokens.colorTextSecondary,
      borderColor: xingshuTokens.colorBorder,
      cellPaddingBlockSM: 8,
      cellPaddingInlineSM: 12,
      cellFontSizeSM: 13
    }
  }
};
