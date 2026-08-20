import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { XsUploadDialog } from "./XsUploadDialog";

function docx(name = "季度通知.docx", size = 24 * 1024) {
  const file = new File(["docx"], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function renderDialog(overrides: Partial<Parameters<typeof XsUploadDialog>[0]> = {}) {
  const onUpload = overrides.onUpload ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <XsUploadDialog
      open
      title="上传 DOCX 模板"
      description="上传后自动做结构分析。"
      accept={[".docx"]}
      maxBytes={25 * 1024 * 1024}
      inputTestId="upload-input"
      {...overrides}
      onUpload={onUpload}
      onClose={onClose}
    />
  );
  return { onUpload, onClose };
}

function dropZone() {
  const zone = document.querySelector(".xs-upload-dialog__zone");
  if (!zone) throw new Error("找不到投放区");
  return zone;
}

describe("XsUploadDialog", () => {
  it("shows the drop affordance and the accepted file limits", () => {
    renderDialog();

    expect(screen.getByText("上传 DOCX 模板")).toBeInTheDocument();
    expect(screen.getByText("把文件拖到这里")).toBeInTheDocument();
    expect(screen.getByText("支持 .docx · 单个文件最大 25 MB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始上传" })).toBeDisabled();
  });

  it("marks the zone while a file is dragged over it", () => {
    renderDialog();
    const zone = dropZone();

    expect(zone).toHaveAttribute("data-state", "idle");
    fireEvent.dragEnter(zone, { dataTransfer: { files: [docx()] } });
    expect(zone).toHaveAttribute("data-state", "dragging");
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute("data-state", "idle");
  });

  it("accepts a dropped file and uploads it", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderDialog({ onUpload });

    fireEvent.drop(dropZone(), { dataTransfer: { files: [docx()] } });

    expect(await screen.findByText("季度通知.docx")).toBeInTheDocument();
    expect(screen.getByText("24 KB · 已就绪")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "开始上传" }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0].name).toBe("季度通知.docx");
    expect(onClose).toHaveBeenCalled();
  });

  it("rejects the wrong file type and an oversized file without calling upload", () => {
    const { onUpload } = renderDialog();

    fireEvent.drop(dropZone(), { dataTransfer: { files: [new File(["x"], "报表.pdf")] } });
    expect(screen.getByRole("alert")).toHaveTextContent("只支持 .docx 文件");

    fireEvent.drop(dropZone(), { dataTransfer: { files: [docx("大模板.docx", 30 * 1024 * 1024)] } });
    expect(screen.getByRole("alert")).toHaveTextContent("文件不能超过 25 MB");

    expect(screen.queryByText("大模板.docx")).not.toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows the reason when the upload fails", async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error("排版引擎不可用"));
    const { onClose } = renderDialog({ onUpload });

    fireEvent.drop(dropZone(), { dataTransfer: { files: [docx()] } });
    await userEvent.click(screen.getByRole("button", { name: "开始上传" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("排版引擎不可用");
    expect(onClose).not.toHaveBeenCalled();
    // antd 的 loading 图标退场动画还挂在按钮上，可访问名此时带着 loading 前缀。
    expect(screen.getByRole("button", { name: /开始上传/ })).toBeEnabled();
  });

  it("picks a file chosen through the system file picker", async () => {
    renderDialog();

    const input = screen.getByTestId("upload-input");
    await userEvent.upload(input, docx("请示通知.docx", 12 * 1024));

    expect(await screen.findByText("请示通知.docx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始上传" })).toBeEnabled();
  });
});
