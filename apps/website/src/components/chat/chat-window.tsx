/*
This file provides the ChatWindow element used in the Courses > Chat view.
*/
/*
TODO:
- Refactor all document.querySelector() and similar uses of direct DOM manipulation to React state-based DOM rerendering because I forgot that was the React paradigm
- Figure out what props the AI model needs to reference so what should be passed to the element can be implemented (most except for course id can probably be implemented via api calls)
- Add markdown rendering and document embeds for AI chatbot reponses, potentially if possible for textarea and user messages as well
- Implement AI internal API handling and passing
- Add nice animations for user and AI messages sliding into frame
- Add nice animation of loading icon or   > . > .. > ... animation when waiting for an API response (or wait to add the message until after a response is recieved) (if there's an option consistent with other pages let me know)
- Add persistency using database and API to store chat messages, with times to create session dividers for chat based on day/session
*/
import "./chat-window.css";

// interface ChatWindowProps {
//     courseCode: string;
//     courseName: string;
// }

export default function ChatWindow(/* props: ChatWindowProps */) {
    const TEXT_BOX_PLACEHOLDER = "Type here to chat with an AI model! (Prototype)";
    const TEXT_BOX_WAITING = "Please wait until a response is recieved...";
    const AI_MESSAGE_WAITING = "Waiting for AI API Response...<br>(Prototype waits 3 seconds)";

    return (
        <section className="chat-window-box">
            <div className="chat-window-messages">
                {/* AI and user messages are placed in here through onKeyDown event in chat-window-fields textarea */}
            </div>
            <form
                className="chat-window-fields"
                onSubmit={(e) => {
                    e.preventDefault();
                }}
            >
                <label aria-label={TEXT_BOX_PLACEHOLDER}>
                    <textarea
                        placeholder={TEXT_BOX_PLACEHOLDER}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();

                                const textarea = e.target as HTMLTextAreaElement;
                                const select = document.querySelector(".chat-window-fields select") as HTMLSelectElement;

                                textarea.form?.requestSubmit();
                                if (select.value === "") {
                                    select.style = "color: var(--color-danger)";

                                    setTimeout(() => {
                                        select.style = "color: default; transition: color 0.2s linear";
                                    }, 250);

                                    return; // Doesn't execute the rest of the code if an LLM model isn't selected, this is super hacky if there's a better way to do this let me know (though React state probably makes something like this relatively trival)
                                }

                                textarea.readOnly = true;
                                textarea.placeholder = TEXT_BOX_WAITING;
                                textarea.ariaLabel = TEXT_BOX_WAITING;

                                const messages = document.querySelector(".chat-window-messages") as HTMLDivElement;

                                const userMessage = document.createElement("div");
                                userMessage.className = "chat-message-box-user";
                                userMessage.innerHTML = `<p>${textarea.value}</p>`; // add markdown rendering later using library plugin? at least for ai return?
                                messages.appendChild(userMessage);

                                textarea.value = "";

                                const aiMessage = document.createElement("div");
                                aiMessage.className = "chat-message-box-ai";
                                aiMessage.innerHTML = `<p>${AI_MESSAGE_WAITING}</p>`;
                                messages.appendChild(aiMessage);

                                setTimeout(() => {
                                    aiMessage.innerHTML = `Once AI APIs are implemented, the response will go here.<br>Response recieved: 
                                    ${new Date().toLocaleTimeString()}<br>Model that would have been used: ${select.selectedOptions[0]?.text}`;

                                    // in actuality should wait for API response or max ~15 seconds otherwise, if response exists process said response otherwise send generic failure (maybe reprompt the user in textbox with their old input?)

                                    // potentially collapse this to some kind of CallAPI function for modularity, same perhaps with other general parts of this

                                    textarea.readOnly = false;
                                    textarea.placeholder = TEXT_BOX_PLACEHOLDER;
                                    textarea.ariaLabel = TEXT_BOX_PLACEHOLDER;
                                }, 3000);
                            }
                        }}
                    />
                </label>
                <label>
                    {/* rename to model once exact models are implemented */}
                    <select required>
                        <option value="" selected hidden disabled>
                            LLM Provider
                        </option>
                        <option value="1">OpenAI</option>
                        <option value="2">DeepSeek</option>
                    </select>
                    LLM Provider
                </label>
            </form>
        </section>
    );
}
