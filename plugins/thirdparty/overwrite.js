var rangeUtils = bespin.tiki.sandbox.require('rangeutils:utils/range');

highlighter.editor.selectionChanged.remove('pairChars');
highlighter.editor.selectionChanged.add('pairChars', function(range) {
    // 0 characters selected (cursor/insertion point placed)
    if(rangeUtils.isZeroLength(range)) {
        // Extend end col by 1 so we can use the next IF statement
        range.end.col += 1;
    }
    
    // 1 character selected
    if(Math.abs(range.start.col - range.end.col) === 1) {
        console.log(highlighter.editor.getText(range));
    }
});