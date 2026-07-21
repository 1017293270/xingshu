import type { EChartsOption } from "echarts";
import { Checks } from "@phosphor-icons/react";
import { useEffect, useState, type CSSProperties } from "react";
import assistantMark from "@/assets/brand/xingshu-assistant-mark-image2-transparent.png";
import { XsEChart } from "./XsEChart";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const demoScript = {
  question: "本月华东区销售额同比增长多少？",
  thinking: "正在校验权限并检索数据",
  answer: "同比增长 12.6%，主要由新能源产品线贡献。"
};

type DemoPhase = "question" | "thinking" | "chart" | "answer" | "hold";

const demoMonths = ["1月", "2月", "3月", "4月", "5月", "6月"];

const chartDemoOption: EChartsOption = {
  color: ["#1677FF", "#29B8ED"],
  animationDuration: 900,
  animationEasing: "cubicOut",
  grid: { top: 34, right: 46, bottom: 26, left: 46 },
  legend: {
    top: 0,
    right: 0,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: { color: "#6B7F9D", fontSize: 11 }
  },
  xAxis: {
    type: "category",
    data: demoMonths,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: "#DCE8FB" } },
    axisLabel: { color: "#6B7F9D", fontSize: 11 }
  },
  yAxis: [
    {
      type: "value",
      axisLabel: { color: "#6B7F9D", fontSize: 11 },
      splitLine: { lineStyle: { color: "#EDF2FB" } }
    },
    {
      type: "value",
      min: 0,
      max: 16,
      interval: 8,
      axisLabel: { color: "#6B7F9D", fontSize: 11, formatter: "{value}%" },
      splitLine: { show: false }
    }
  ],
  series: [
    {
      name: "销售额（万元）",
      type: "bar",
      barWidth: 16,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: [862, 934, 1018, 995, 1136, 1268]
    },
    {
      name: "同比增速",
      type: "line",
      yAxisIndex: 1,
      smooth: true,
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { width: 2.5 },
      data: [5.1, 6.4, 8.2, 7.6, 10.3, 12.6]
    }
  ]
};

function useAskDemo(reducedMotion: boolean) {
  const [state, setState] = useState<{ phase: DemoPhase; questionChars: number; answerChars: number }>(() =>
    reducedMotion
      ? { phase: "hold", questionChars: demoScript.question.length, answerChars: demoScript.answer.length }
      : { phase: "question", questionChars: 0, answerChars: 0 }
  );

  useEffect(() => {
    if (reducedMotion) {
      setState({
        phase: "hold",
        questionChars: demoScript.question.length,
        answerChars: demoScript.answer.length
      });
      return undefined;
    }

    let cancelled = false;
    let timer = 0;
    const schedule = (step: () => void, delay: number) => {
      timer = window.setTimeout(() => {
        if (!cancelled) {
          step();
        }
      }, delay);
    };

    const play = () => {
      setState({ phase: "question", questionChars: 0, answerChars: 0 });

      let typed = 0;
      const typeQuestion = () => {
        typed += 1;
        setState((prev) => ({ ...prev, questionChars: typed }));
        if (typed < demoScript.question.length) {
          schedule(typeQuestion, 48);
          return;
        }
        schedule(() => {
          setState((prev) => ({ ...prev, phase: "thinking" }));
          schedule(playChart, 900);
        }, 260);
      };

      const playChart = () => {
        setState((prev) => ({ ...prev, phase: "chart" }));
        schedule(playAnswer, 1_500);
      };

      const playAnswer = () => {
        setState((prev) => ({ ...prev, phase: "answer" }));
        let answerTyped = 0;
        const typeAnswer = () => {
          answerTyped += 1;
          setState((prev) => ({ ...prev, answerChars: answerTyped }));
          if (answerTyped < demoScript.answer.length) {
            schedule(typeAnswer, 34);
            return;
          }
          schedule(() => {
            setState((prev) => ({ ...prev, phase: "hold" }));
            schedule(play, 3_400);
          }, 280);
        };
        schedule(typeAnswer, 140);
      };

      schedule(typeQuestion, 520);
    };

    play();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reducedMotion]);

  return state;
}

type XsAskDataDemoProps = {
  className?: string;
  style?: CSSProperties;
};

export function XsAskDataDemo({ className = "", style }: XsAskDataDemoProps) {
  const reducedMotion = usePrefersReducedMotion();
  const demo = useAskDemo(reducedMotion);
  const isChartVisible = demo.phase === "chart" || demo.phase === "answer" || demo.phase === "hold";
  const isAnswerVisible = demo.phase === "answer" || demo.phase === "hold";
  const isGenerating = demo.phase === "chart" && !reducedMotion;

  return (
    <div
      className={`xs-ask-demo${isGenerating ? " xs-ask-demo--generating" : ""} ${className}`}
      style={style}
      aria-hidden="true"
    >
      <div className="xs-ask-demo__header">
        <span className="xs-ask-demo__live">
          <i />
          问数 · 实时演示
        </span>
        <span className="xs-ask-demo__badge">
          <Checks size={13} weight="bold" />
          全程可追溯
        </span>
      </div>

      <div className="xs-ask-demo__thread">
        {demo.questionChars > 0 || demo.phase !== "question" ? (
          <p className="xs-ask-demo__question">
            {demoScript.question.slice(0, demo.questionChars)}
            {demo.phase === "question" ? <span className="xs-ask-demo__caret" /> : null}
          </p>
        ) : null}

        {isChartVisible ? (
          <div className="xs-ask-demo__chart">
            <XsEChart option={chartDemoOption} label="华东区月度销售额与同比增速示例图" />
          </div>
        ) : (
          <div className="xs-ask-demo__skeleton">
            {Array.from({ length: 6 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
        )}

        <div className="xs-ask-demo__slot">
          {demo.phase === "thinking" ? (
            <p className="xs-ask-demo__thinking">
              <span className="xs-ask-demo__dots">
                <i />
                <i />
                <i />
              </span>
              {demoScript.thinking}
            </p>
          ) : null}

          {isAnswerVisible ? (
            <div className="xs-ask-demo__answer">
              <img src={assistantMark} alt="" />
              <p>
                {demoScript.answer.slice(0, demo.answerChars)}
                {demo.phase === "answer" ? <span className="xs-ask-demo__caret" /> : null}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
