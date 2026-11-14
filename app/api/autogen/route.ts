import type { NextRequest } from "next/server";
import { spawn } from "child_process";
import { Readable } from "stream";

// 將 Node.js 的 Readable stream 轉成 Web Stream
function nodeStreamToWebStream(nodeStream: Readable) {
    return new ReadableStream({
        start(controller) {
            nodeStream.on("data", (chunk) => {
                controller.enqueue(chunk);
            });
            nodeStream.on("end", () => {
                controller.close();
            });
            nodeStream.on("error", (err) => {
                controller.error(err);
            });
        },
        cancel() {
            nodeStream.destroy();
        },
    });
}

export async function POST(req: NextRequest) {
    try {
        const { task } = await req.json();

        if (!task) {
            return new Response(JSON.stringify({ error: "Task is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // 建立一個 Readable stream 用來捕捉 Python 輸出
        const outputStream = new Readable({
            read() { },
        });

        // 以子進程方式執行修改後的 autogen.py（需確保 __main__ 區塊可根據參數執行任務並印出結果）
        // const pythonProcess = spawn("python", ["./autogen_system/autogen.py", task]);
        // const pythonProcess = spawn("python", ["./autogen_system/autogen.py"]);
        const pythonProcess = spawn("python", ["./autogen_system/autogen_ollama.py", task], {
            env: {
                ...process.env,
                PYTHONIOENCODING: "utf-8"
            }
        });

        const beginMarkers = [
            "---------- user ----------",
            "---------- programmer ----------",
            "---------- code_executor ----------",
            "---------- code_reviewer ----------",
        ]

        let currentAgent: string | null = null
        let currentContent = ""

        // 處理 Python 程式的 stdout 輸出（預設使用 UTF-8 編碼）
        pythonProcess.stdout.on("data", (data) => {
            const output = data.toString();
            console.log(`stdout: ${output}`);

            const lines: string[] = output.split("\n").filter((line: string) => line.trim() !== "");

            for (const line of lines) {
                if (beginMarkers.some((beginMarker) => line.includes(beginMarker))) {
                    if (currentAgent && currentAgent !== "user" && currentContent.trim() !== "") {
                        try {
                            outputStream.push(
                                JSON.stringify({
                                    agent: currentAgent,
                                    content: currentContent,
                                }) + "\n"
                            )
                        } catch (error) {
                            console.error("Error processing output:", error)
                            outputStream.push(
                                JSON.stringify({
                                    agent: "err",
                                    content: "解析輸出時發生錯誤。",
                                }) + "\n"
                            )
                        }

                    }
                    currentAgent = line.replace(/----------/g, "").trim()
                    currentContent = ""
                } else {
                    if (currentAgent) {
                        currentContent += line + "\n"
                    }
                }
            }

        });

        // 處理 stderr 輸出
        pythonProcess.stderr.on("data", (data) => {
            const errorOutput = data.toString();
            console.log(`#stderr: ${errorOutput}`);
            outputStream.push(
                JSON.stringify({
                    agent: "err",
                    content: `執行錯誤: ${errorOutput}`,
                }) + "\n"
            );
            currentAgent = "err";
        });

        // 當 Python 程式結束時s，結束 stream
        pythonProcess.on("close", (code) => {
            console.log(`Python process exited with code ${code}`);
            if (code === 0) {
                if (currentAgent && currentAgent !== "user" && currentAgent !== "err" && currentContent.trim() !== "") {
                    try {
                        outputStream.push(
                            JSON.stringify({
                                agent: currentAgent,
                                content: currentContent,
                            }) + "\n"
                        )
                    } catch (error) {
                        console.error("Error processing output:", error)
                    }

                }
                currentContent = ""
            } else {
                outputStream.push(
                    JSON.stringify({
                        agent: "close",
                        content: `程序異常退出，退出碼: ${code}`,
                    }) + "\n"
                );
            }
            outputStream.push(null);
        });

        // 將 Node.js 的 Readable stream 轉換為 Web Stream
        const webStream = nodeStreamToWebStream(outputStream);

        // 回傳 stream 給前端
        return new Response(webStream, {
            headers: {
                "Content-Type": "application/json",
                "Transfer-Encoding": "chunked",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (error) {
        console.error("Error in autogen API:", error);
        return new Response(JSON.stringify({ error: "Failed to process your request" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
