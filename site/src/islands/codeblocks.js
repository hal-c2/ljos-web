// Every live code block on the page, hydrated as it nears the viewport.
import "ljos-web/codeblock.css";
import "ljos-web/runtime.css";
import { hydrateLiveCodeBlocks } from "ljos-web/codeblock";

hydrateLiveCodeBlocks(document);
