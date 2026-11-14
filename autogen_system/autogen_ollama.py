import asyncio
import sys

from autogen_agentchat.agents import AssistantAgent, CodeExecutorAgent
from autogen_agentchat.conditions import TextMentionTermination, MaxMessageTermination
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_ext.code_executors.local import LocalCommandLineCodeExecutor
from autogen_agentchat.ui import Console
from autogen_ext.models.ollama import OllamaChatCompletionClient

from dotenv import load_dotenv
load_dotenv()

async def main(task):
    if task is None:
        task = "編寫 Python 程式碼將華氏溫度轉換為攝氏度。"

    ollama_model_client = OllamaChatCompletionClient(
        model="my_qwen2.5_newQ8_py:latest",
        model_info={"family": "qwen2.5", "format":"chat","json_output":False,"vision":False,"function_calling":False},)
    ollama_model_client2 = OllamaChatCompletionClient(
        model="qwen2.5-coder:latest",
        model_info={"family": "qwen2.5", "format":"chat","json_output":False,"vision":False,"function_calling":False},)

    Programmer_client = ollama_model_client
    CodeReviewer_client = ollama_model_client2

    # 創建Python開發工程師
    Programmer_Agent = AssistantAgent(
        "programmer",
        model_client=Programmer_client,
        #system_message="請用繁體中文回答。",
        system_message="""你是一個專業的Python開發工程師。
        請基於需求編寫清晰、可維護且符合PEP8規範的Python程式碼。
        使用markdown區塊標記程式碼，並標注使用的程式語言。
        只要輸出一個完整的程式碼，並確保程式碼能夠正常運行。
        請照著code_reviewer建議修改,修改後請重新輸出完整程式碼。
        請生成不需要用戶輸入（例如 input() 函數）的程式碼，確保程式碼可以直接運行並返回結果。
        請確保程式碼中有完整的單元測試。
        請確保程式碼中與回答都使用繁體中文。
        """,
    )
#  程式碼要包含:
#         - 清晰的註釋和文件字串
#         - 適當的錯誤處理
#         - 單元測試

    # 創建代碼審查專家
    CodeReviewer_Agent = AssistantAgent(
        "code_reviewer",
        model_client=CodeReviewer_client,
        system_message="""你是一個語法分析器。你的任務是檢查來自programmer的Python程式碼的語法和邏輯錯誤。
        在審查程式碼時，請遵循以下步驟：
        1. 檢查程式碼的語法和邏輯錯誤。
        2. 提供具體的建議和修改意見。
        3. 確保程式碼符合PEP8規範。
        回覆'同意通過'表示程式碼經過code_executor後成功執行且沒有錯誤，否則請提供具體的修改建議。
        """,

    )

    """你是一位資深的程式碼審查專家。請對程式碼進行全面的評審
        你需要與一位Python開發工程師互相溝通
        並確保程式碼執行结果符合預期。
        不須生成程式碼,只需給予建議和意見。
        確保programmer生成的程式碼需以markdown區塊標記。
        請確保programmer生成的程式中沒有由使用者輸入。
        請確保執行時沒發生錯誤,再回覆'同意通過,並輸出最終程式碼'。
        只要本次有需修改,請勿回覆'同意通過'。
        使用繁體中文回答。"""
    code_executor = CodeExecutorAgent(
        name="code_executor",
        code_executor=LocalCommandLineCodeExecutor(work_dir="coding"),
        sources="programmer",
    )

    text_termination = TextMentionTermination("The POSIX exit code was: 0.") | MaxMessageTermination(30) | TextMentionTermination("同意通過")
    # 創建一個包含主要智能助手和評論員的團隊
    team = RoundRobinGroupChat([Programmer_Agent,code_executor, CodeReviewer_Agent], termination_condition=text_termination)
    #team = SlectedGroupChat([Programmer_Agent,code_executor, CodeReviewer_Agent], termination_condition=text_termination)

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