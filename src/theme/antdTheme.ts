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
    Menu: {
      itemBorderRadius: xingshuTokens.radiusControl,
      itemSelectedBg: "#EAF3FF",
      itemSelectedColor: xingshuTokens.colorPrimaryStrong
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
