import React from "react"
import { Editor,  RichUtils } from "draft-js"
import "draft-js/dist/Draft.css";
import { getSelectionInfo } from './tools.js'
const DPI = 96;
const MM_PER_IN = 25.4;
const DPMM = DPI / MM_PER_IN;


// optimization status codes
// status codes for optimization direction 
// had to move this to a floating object because MS Edge doesn't support static variables
const BULLET = {
    OPTIMIZED: 0,
    FAILED_OPT: 1,
    NOT_OPT: -1,
    ADD_SPACE: 1,
    REM_SPACE: -1,
    MAX_UNDERFLOW: -4,
    Tokenize: (sentence) => {
        return sentence.split(/[\s]+/);
    },
}


function BulletComparator({ editorState, setEditorState, width, ...props }) {
    
    const bulletOutputID = "bulletOutput";
    const [heightMap, setHeightMap] = React.useState(new Map());
    // Editor callback that adds rich text editor keybinds
    const handleKeyCommand = (command, editorState) => {
        const newState = RichUtils.handleKeyCommand(editorState, command);
        if (newState) {
            setEditorState(newState);
            return 'handled';
        }
        return 'not-handled';
    }

    // Editor callback that runs whenever edits or selection changes occur.
    const onChange = (newEditorState) => {

        

        //const content = editorState.getCurrentContent();
        // ordered map has a key and a block associasted with it
        //const blockMap = content.getBlockMap();
        /*
        for(let [key,block] of blockMap){
            console.log(block.getText());
        }
        */
        const { selectedText } = getSelectionInfo(newEditorState)
        if (props.onSelect && selectedText !== '') props.onSelect(selectedText);
        
        setEditorState(newEditorState);
    }

    // This other bullet selection is for when things are selected on the optimized output
    const onBulletSelect = (event) => {
        const selection = window.getSelection().toString();
        if (selection !== "") {
            props.onSelect(selection)
        }
    }

    // control-a selectability on bullet outputs
    function selectOutput(e) {
        if (e.ctrlKey && e.keyCode === 65) {
            e.preventDefault();
            //console.log('control-a')
            //console.log(this.outputRef.current)
            if (e.target.id.match(new RegExp(bulletOutputID))) {
                const range = document.createRange();
                range.selectNode(e.target);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            }
        }
    }

    React.useEffect(()=>{
        let newHeightMap = new Map();
        for(let key of editorState.getCurrentContent().getBlockMap().keys()){
            const blockDiv = document.querySelector(`div[data-offset-key="${key}-0-0"]`);
            if(blockDiv) newHeightMap.set(key, blockDiv.getBoundingClientRect().height);
        };
        setHeightMap(newHeightMap);
    },[editorState])

    return (
        <div className="bullets columns is-multiline" >
            <div className="column" style={{
                // width: width + 'mm',
            }}>
                <h2 className='subtitle'>Input Bullets Here:</h2>
                <div className="border" style={{ width: (width+1) + 'mm'}}>
                    <Editor 
                        editorState={editorState} onChange={onChange} handleKeyCommand={handleKeyCommand} />
                </div>
            </div>
            <div className="column" >
                <h2 className='subtitle'>View Output Here:</h2>
                <div className="border" id={bulletOutputID} style={{ width: (width+1) + 'mm' }}
                    onMouseUp={onBulletSelect} onKeyDown={selectOutput} tabIndex="0">
                    {Array.from(editorState.getCurrentContent().getBlockMap(), ([key, block]) => {
                        let text = block.getText();
                        if (props.abbrReplacer) text = props.abbrReplacer(text);
                        
                        return <Bullet key={key} text={text} widthPx={width * DPMM} height={heightMap.get(key)} 
                            enableOptim={props.enableOptim} />
                    })}
                </div>
            </div>
        </div>);
}
/*
            <div>
                {editorState.getCurrentContent().getBlocksAsArray().map((block, key)=>{
                    return <Bullet text={block.getText()} width={202.321*DPMM}/>
                })}
            </div>

*/




function Bullet({ text, widthPx, ...props }) {
    const canvasRef = React.useRef(null);
    const [outputText, setOutputText] = React.useState([' ']);

    const [color, setColor] = React.useState('inherit');
    const [loading, setLoading] = React.useState(false);
    const [optimStatus, setOptimStatus] = React.useState(BULLET.NOT_OPT);
    const [rendering, setBulletRendering] = React.useState({ text: '' });

    const getContext = (canvas) => {
        //now we can draw in 2d here.
        const context = canvas.getContext('2d');
        context.font = '12pt Times New Roman';
        context.textAlign = 'left';
        return context;
    }

    // This effect updates the text rendering (i.e. enforces width constraints by inserting newlines)
    //   whenever the props text input is updated.
    React.useEffect(() => {
 
        const context = getContext(canvasRef.current)
        setBulletRendering(renderBulletText(text, context, widthPx));

    }, [text, widthPx, props.enableOptim]);
    // [] indicates that this happens once after the component mounts.
    // [props.text] indicates that this happens every time the text changes from the user

    // This effect happens after bullet rendering changes. It evaluates the rendered bullet and
    //  sees how it can be improved with modified spaces. 
    React.useEffect(() => {

        setLoading(true);
        setOutputText(rendering.text);
        if (props.enableOptim) {
            const optimizer = (txt) => renderBulletText(txt, getContext(canvasRef.current), widthPx);
            const optimResults = optimize(text, optimizer);
            setLoading(false);
            setOptimStatus(optimResults.status);
            setOutputText(optimResults.rendering.text);
            
        } else {
            setOutputText(rendering.text);
            setLoading(false);
        }

    }, [rendering, props.enableOptim, text, widthPx]);

    //color effect
    React.useEffect(() => {
        if (loading) {
            setColor("silver")
        } else if (optimStatus === BULLET.FAILED_OPT) {
            setColor("red");
        } else {
            setColor("inherit");
        }
    }, [loading, outputText, optimStatus])

    // the style properties help lock the canvas in the same spot and make it essentially invisible.
    //whitespace: pre-wrap is essential as it allows javascript string line breaks to appear properly.
    return (
        <>
            <canvas
                ref={canvasRef}
                style={{
                    visibility: "hidden",
                    position: "absolute",
                    top: "-1000px",
                    left: "-1000px"
                }} />
            <div style={{
                minHeight: props.height,
                color: color,
                display:'flex',
                flexDirection:'column',
            }} onMouseUp={props.onHighlight} >
                {outputText.map((line)=>{
                    return <span key={line} style={{whiteSpace:"pre"}}>{line}</span>;
                })}
            </div>
        </>
    );
    //return canvas;
}


function optimize(sentence, evalFcn) {

    const smallerSpace = "\u2006";
    const largerSpace = "\u2004";

    //initialization of optimized words array
    let optWords = BULLET.Tokenize(sentence);

    const initResults = evalFcn(sentence);

    if (initResults.overflow === 0) {
        return initResults;
    }

    //initial instantiation of previousResults
    let prevResults = initResults;
    let finalResults = initResults;
    const newSpace = (initResults.overflow >= 0) ? smallerSpace : largerSpace;

    let finalOptimStatus = BULLET.NOT_OPT;

    function hashCode (str) {
        let hash = 0, i, chr;
        if (str.length === 0) return hash;
        for (i = 0; i < str.length; i++) {
          chr = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + chr;
          hash |= 0; // Convert to 32bit integer
        }
        return hash;
      };

    function getRandomInt(seed, max) {
        return Math.floor(Math.abs((Math.floor(9 * hashCode(seed) + 5) % 100000) / 100000) * Math.floor(max));
    }

    
    const worstCaseResults = evalFcn(optWords.join(newSpace));

    if( (newSpace === smallerSpace && worstCaseResults.overflow > 0) || 
            (newSpace === largerSpace && worstCaseResults.overflow < BULLET.MAX_UNDERFLOW) ){
            // this means that there is no point in trying to optimize.
            
            return {
                status: BULLET.FAILED_OPT,
                rendering: worstCaseResults,
            };
        
    }

    while (finalResults.overflow > 0 || finalResults.overflow < BULLET.MAX_UNDERFLOW) {
        //don't select the first space after the dash- that would be noticeable and look wierd.
        // also don't select the last word, don't want to add a space after that.
        let iReplace = getRandomInt(optWords.join(''), optWords.length - 1 - 1) + 1;

        //merges two elements together, joined by the space
        optWords.splice(
            iReplace, 2,
            optWords.slice(iReplace, iReplace + 2).join(newSpace)
        );

        //make all other spaces the normal space size
        let newSentence = optWords.join(' ');

        let newResults = evalFcn(newSentence);

        if (initResults.overflow <= 0 && newResults.overflow > 0) {
            //console.log("Note: Can't add more spaces without overflow, reverting to previous" );
            finalResults = prevResults;
            finalOptimStatus = BULLET.OPTIMIZED;
            break;
        } else if (initResults.overflow > 0 && newResults.overflow < 0) {
            //console.log("Removed enough spaces. Terminating." );
            finalResults = newResults;
            finalOptimStatus = BULLET.OPTIMIZED;
            break;
        } else if (optWords.length <= 2) { //this conditional needs to be last
            //console.log("\tWarning: Can't replace any more spaces");
            finalResults = newResults;
            finalOptimStatus = BULLET.FAILED_OPT;
            break;
        }
        prevResults = newResults;
    }
    return {
        status: finalOptimStatus,
        rendering: finalResults,
    };
}

// all widths in this function are in pixels
function renderBulletText(text, context, width) {
    // this function expects a single line of text with no line breaks.
    if(text.match('\n')){
        console.error('renderBulletText expects a single line of text');
    }
    const getWidth = (txt) => (context.measureText(txt)).width;
    const fullWidth = getWidth(text.trimEnd());

    if (fullWidth < width) {
        return {
            text: [text],
            fullWidth: fullWidth,
            lines: 1,
            overflow: fullWidth - width,
        };
    } else {
        // Scenario where the width of the text is wider than desired.
        //  In this case, work needs to be done to figure out where the line breaks should be. 

        // Regex- split after one of the following: \s ? / | - % ! 
        // but ONLY if immediately followed by: [a-zA-z] [0-9] + \
        const textSplit = text.split(/(?<=[\s?/|\-%!])(?=[a-zA-Z0-9+\\])/);

        // check to make sure the first token is smaller than the desired width.
        //   This is usually true, unless the desired width is abnormally small, or the 
        //   input text is one really long word
        if (getWidth(textSplit[0]) < width) {
            let answerIdx = 0;
            for (let i = 1; i <= textSplit.length; i++) {
                const evalText = textSplit.slice(0, i).join('').trimEnd();
                const evalWidth = getWidth(evalText);
                if (evalWidth > width) {
                    answerIdx = i - 1;
                    break;
                }
            }
            const recursedText = textSplit.slice(answerIdx, textSplit.length).join('');

            if (recursedText === text) {
                console.warn("Can't fit \"" + text + "\" on a single line");
                return {
                    text: [text],
                    fullWidth,
                    lines: 1,
                    overflow: fullWidth - width,
                };
            } else {
                const recursedResult = renderBulletText(recursedText, context, width);

                return {
                    text: [textSplit.slice(0, answerIdx).join(''), ...recursedResult.text],
                    fullWidth: fullWidth,
                    lines: 1 + recursedResult.lines,
                    overflow: fullWidth - width,
                }
            }

        } else {

            const avgCharWidth = fullWidth / (text.length);
            const guessIndex = parseInt(width / avgCharWidth);
            const firstGuessWidth = getWidth(text.substring(0, guessIndex))
            let answerIdx = guessIndex;
            if (firstGuessWidth > width) {
                for (let i = guessIndex - 1; i > 0; i--) {
                    const nextGuessWidth = getWidth(text.substring(0, i));
                    if (nextGuessWidth < width) {
                        answerIdx = i;
                        break;
                    }
                }
            } else if (firstGuessWidth < width) {
                for (let i = guessIndex; i <= text.length; i++) {

                    const nextGuessWidth = getWidth(text.substring(0, i));
                    if (nextGuessWidth > width) {
                        answerIdx = i - 1;
                        break;
                    }
                }
            }
            const recursedText = text.substring(answerIdx, text.length);
            if (recursedText === text) {
                console.warn("Could not even fit first character of \"" + text + "\" on a single line");
                return {
                    text: [text],
                    fullWidth,
                    lines: 1,
                    overflow: fullWidth - width
                };
            } else {
                const recursedResult = renderBulletText(recursedText, context, width);

                return {
                    text: [text.substring(0, answerIdx), ...recursedResult.text],
                    fullWidth: fullWidth,
                    lines: 1 + recursedResult.lines,
                    overflow: fullWidth - width,
                }
            }
        }
    }
}


export { Bullet, BULLET, BulletComparator, renderBulletText };