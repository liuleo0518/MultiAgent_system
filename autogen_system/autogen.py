import asyncio
import sys

from autogen_agentchat.agents import AssistantAgent, CodeExecutorAgent
from autogen_agentchat.conditions import TextMentionTermination, MaxMessageTermination
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_ext.code_executors.local import LocalCommandLineCodeExecutor
from autogen_agentchat.ui import Console
from autogen_ext.models.openai import OpenAIChatCompletionClient

from dotenv import load_dotenv
load_dotenv()

async def main(task: str = None) -> str:
    # 若未傳入任務，設定預設任務內容
    if task is None:
        task = "編寫 Python 程式碼將華氏溫度轉換為攝氏度。"

    def get_model_client_ollama() -> OpenAIChatCompletionClient:  # type: ignore
        return OpenAIChatCompletionClient(
            # model="python_model_Taiwan:latest",
            model="my_unsloth.Q4_K_M:latest",
            api_key="ollama",
            base_url="http://localhost:11434/v1",
            model_capabilities={
                "json_output": False,
                "vision": False,
                "function_calling": True,
            },
            structured_output=False,  # ✅ 加上這行
        )

    def get_model_client_ollama2() -> OpenAIChatCompletionClient:  # type: ignore
        return OpenAIChatCompletionClient(
            # model="codellama:7b-instruct",
            model="qwen2.5-coder:latest",
            api_key="ollama",
            base_url="http://localhost:11434/v1",
            model_capabilities={
                "json_output": False,
                "vision": False,
                "function_calling": True,
            },
            structured_output=False,  # ✅ 加上這行
        )

    CodeReviewer_client = get_model_client_ollama()
    Programmer_client = get_model_client_ollama2()

    # 創建 Python 開發工程師
    Programmer_Agent = AssistantAgent(
        "programmer",
        model_client=Programmer_client,
        system_message="""你是一個專業的Python開發工程師。
請基於需求編寫清晰、可維護且符合PEP8規範的Python程式碼。
使用markdown區塊標記程式碼，並標注使用的程式語言。
每次都輸出完整程式碼，並確保程式碼能夠正常運行。
使用繁體中文回答。
請勿使用!pip install
""",
    )

    CodeReviewer_Agent = AssistantAgent(
        "code_reviewer",
        model_client=CodeReviewer_client,
        system_message="""你是一位資深的程式碼審查專家。請對程式碼進行全面的評審
並確保程式碼執行結果符合預期。
不須生成程式碼,只需給出程式碼修改建議。
請勿回覆帶有markdown區塊的程式碼。
確保programmer生成的程式碼需以markdown區塊標記。
使用繁體中文回答。
當programmer生成的程式碼符合要求且code_executor執行沒發生錯誤時,回覆'同意通過'。
""",
    )

    code_executor = CodeExecutorAgent(
        name="code_executor",
        code_executor=LocalCommandLineCodeExecutor(work_dir="coding"),
    )
    text_termination = TextMentionTermination("同意通過") | MaxMessageTermination(30)

    team = RoundRobinGroupChat(
        [Programmer_Agent, code_executor, CodeReviewer_Agent],
        termination_condition=text_termination,
    )

    # 使用 run_stream 取得流式結果，這裡 Console() 會進行輸出，但我們也收集結果字串回傳
    # 若需要回傳完整結果，可考慮修改 Console 或自行處理消息收集
    result = team.run_stream(task=task)
    await Console(result)

    # 假設 Console() 的過程中會印出結果，你也可以改成收集並回傳資料
    return f"任務 '{task}' 執行完成！"  # 此處依你的需求回傳適當資料

# 提供同步接口供其他模組使用
def run_sync(task: str = None) -> str:
    return asyncio.run(main(task))

# 若直接執行此檔案，則呼叫 main()
if __name__ == "__main__":
    task = sys.argv[1] if len(sys.argv) > 1 else None
    result = asyncio.run(main(task))
    # print(result)

