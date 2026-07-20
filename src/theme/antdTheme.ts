import type { ThemeConfig } from "antd";
import { xingshuTokens } from "./xingshuTokens";

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: xingshuTokens.colorPrimary,
    colorBgLayout: xingshuTokens.colorBg,
    colorBgContainer: xingshuTokens.colorSurface,
    colorText: xingshuTokens.colorText,
    colorTextSecondary: xingshuTokens.colorTextSecondary,
    colorTextTertiary: xingshuTokens.colorTextTertiary,
    colorBorder: xingshuTokens.colorBorder,
    colorSuccess: xingshuTokens.colorSuccess,
    colorWarning: xingshuTokens.colorWarning,
    colorError: xingshuTokens.colorDanger,
    borderRadius: xingshuTokens.radiusControl,
    fontFamily: xingshuTokens.fontFamily,
    controlHeight: xingshuTokens.controlHeight,
    motionUnit: xingshuTokens.motionFast / 1000,
    motionBase: 0
  },
  components: {
    Button: {
      borderRadius: xingshuTokens.radiusControl,
      controlHeight: xingshuTokens.controlHeight,
      primaryShadow: xingshuTokens.shadowButton
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
      itemSelectedBg: "#FFFFFF",
      itemSelectedColor: xingshuTokens.colorPrimaryStrong,
      trackBg: "#F3F8FF"
    },
    Tag: {
      borderRadiusSM: 999,
      defaultBg: "#EAF3FF",
      defaultColor: xingshuTokens.colorPrimaryStrong
    },
    Alert: {
      borderRadiusLG: xingshuTokens.radiusCard
    }
  }
};
