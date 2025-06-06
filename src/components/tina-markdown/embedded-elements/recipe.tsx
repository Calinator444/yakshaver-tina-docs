import { ChevronDownIcon } from "@heroicons/react/24/outline";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { TinaMarkdown } from "tinacms/dist/rich-text";
import { customHighlightCSS } from "./recipe.constants";
import CodeBlockWithHighlightLines from "./recipe.helpers";

export const RecipeBlock = (data: {
  title?: string;
  description?: string;
  codeblock?: any;
  code?: string;
  instruction?: any;
}) => {
  const { title, description, codeblock, code, instruction } = data;

  const [highlightLines, setHighlightLines] = useState("");
  const [clickedInstruction, setClickedInstruction] = useState<number | null>(
    null
  );
  //LHSheight is the height used for the instructions block when the screen is >= 1024px
  const [LHSheight, setLHSheight] = useState<string | null>(null);
  const [isBottomOfInstructions, setIsBottomOfInstructions] =
    useState<boolean>(false);

  const codeblockRef = useRef<HTMLDivElement>(null);
  const instructionBlockRefs = useRef<HTMLDivElement>(null);
  const instructionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = customHighlightCSS;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    setLHSheight(`${codeblockRef.current?.offsetHeight}`);
  }, []);

  const checkIfBottom = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
    setIsBottomOfInstructions(scrollHeight - scrollTop <= clientHeight + 10);
  };

  const handleInstructionClick = (
    index: number,
    codeLineStart?: number,
    codeLineEnd?: number
  ) => {
    setHighlightLines(`${codeLineStart}-${codeLineEnd}`);
    setClickedInstruction(index === clickedInstruction ? null : index);

    const linePixelheight = 24;
    // gives the moving logic some breathing room
    const linePixelBuffer = 15;

    if (codeblockRef.current) {
      codeblockRef.current.scrollTo({
        top: linePixelheight * (codeLineStart || 0) - linePixelBuffer,
        behavior: "smooth",
      });
    }

    if (window.innerWidth < 1024 && instructionRefs.current[index]) {
      instructionRefs.current[index].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  };

  const handleDownArrowClick = () => {
    const lastInstruction =
      instructionRefs.current[instructionRefs.current.length - 1];
    if (lastInstruction) {
      lastInstruction.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  };

  //height used for the instructions container when the screen is < 1024px. Maintains 1:2 ratio of instruction to code
  const smAndMbHeight = LHSheight ? `${Number(LHSheight) / 2}px` : null;

  const calculateInstructionsHeight = () => {
    return instructionRefs.current.reduce((total, ref) => {
      return total + (ref?.offsetHeight || 0);
    }, 0);
  };

  const checkIfScrollable = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      return (
        calculateInstructionsHeight() >=
        Number.parseInt(smAndMbHeight || "0", 10)
      );
    }
    return (
      calculateInstructionsHeight() > Number.parseInt(LHSheight || "0", 10)
    );
  };

  return (
    <div className="recipe-block-container relative w-full text-white">
      <div className="title-description px-10">
        <h2 className="font-tuner text-2xl text-orange-500">
          {title || "Default Title"}
        </h2>
        <p className="py-2 text-base font-light">
          {description || "Default Description"}
        </p>
      </div>

      <div className="content-wrapper flex flex-col items-stretch px-10 lg:flex-row">
        <div
          className="instructions max-h-50vh relative flex shrink-0 grow flex-col rounded-t-xl rounded-br-xl bg-gray-800 lg:w-1/3 lg:rounded-r-none lg:rounded-bl-xl"
          ref={instructionBlockRefs}
          style={{
            height:
              typeof window !== "undefined" && window.innerWidth >= 1024
                ? `${LHSheight}px`
                : `${smAndMbHeight}`,
          }}
        >
          <div className={`${isBottomOfInstructions ? "hidden" : ""}`}>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black opacity-60 lg:rounded-bl-xl" />
            <ChevronDownIcon
              onClick={handleDownArrowClick}
              className={`absolute bottom-4 left-1/2 size-7 -translate-x-1/2 cursor-pointer text-xl text-white shadow-md${
                checkIfScrollable() ? "" : "hidden"
              }`}
            />
          </div>

          <div
            className="overflow-auto rounded-t-xl rounded-bl-xl lg:rounded-tr-none"
            onScroll={checkIfBottom}
          >
            {instruction?.map((inst, idx) => (
              <div
                key={`instruction-${idx}`}
                ref={(element) => {
                  instructionRefs.current[idx] = element;
                }}
                className={`instruction-item cursor-pointer border-y border-gray-700 bg-gray-800 p-4 text-white 
                ${clickedInstruction === idx ? "bg-slate-600" : ""}`}
                onClick={() =>
                  handleInstructionClick(
                    idx,
                    inst.codeLineStart,
                    inst.codeLineEnd
                  )
                }
              >
                <h5 className="font-tuner">{`${idx + 1}. ${
                  inst.header || "Default Header"
                }`}</h5>
                <div
                  className={`overflow-auto transition-all ease-in-out ${
                    clickedInstruction === idx
                      ? "max-h-full opacity-100 duration-500"
                      : "max-h-0 opacity-0 duration-0"
                  }`}
                >
                  <span className="mt-2">
                    {inst.itemDescription || "Default Item Description"}
                  </span>
                </div>
              </div>
            )) || <p>No instructions available.</p>}
          </div>
        </div>

        <div
          ref={codeblockRef}
          className="codeblock max-h-50vh overflow-auto rounded-b-xl bg-gray-800 lg:w-2/3 lg:rounded-bl-none lg:rounded-tr-xl "
        >
          {code ? (
            <CodeBlockWithHighlightLines
              value={code}
              lang="javascript"
              highlightLines={highlightLines}
            />
          ) : codeblock ? (
            <TinaMarkdown
              content={codeblock}
              components={{
                code_block: (props) => (
                  <CodeBlockWithHighlightLines
                    {...props}
                    highlightLines={highlightLines}
                  />
                ),
              }}
            />
          ) : (
            <p>No code block available.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipeBlock;
