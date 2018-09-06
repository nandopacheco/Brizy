/**
 * Parses the page and the css generated by glamor
 * and finds all inline font families that were used in it and appends them to head
 */

import {
  getUsedFonts,
  makeFontsUrl,
  makeRichTextFontFamiliesCSS
} from "visual/utils/fonts";

export default function addFonts($) {
  const allPossibleFonts = getUsedFonts();
  const parsedFontFamilies = parseFontFamilies($);

  if (allPossibleFonts.length > 0 && parsedFontFamilies.length > 0) {
    const parsedFontFamiliesObj = arrayToObject(parsedFontFamilies);
    const fontsToLoad = allPossibleFonts
      .filter(
        font =>
          parsedFontFamiliesObj[font.id] ||
          parsedFontFamiliesObj[font.family.replace(/\s+/g, "")]
      )
      .map(font => font.id);

    const fontsUrl = makeFontsUrl(fontsToLoad);
    $("head").append(
      `<link type="text/css" rel="stylesheet" href="${fontsUrl}" />`
    );

    const richTextFamiliesCSS = makeRichTextFontFamiliesCSS(fontsToLoad);
    $("head").append(`<style>${richTextFamiliesCSS}</style>`);
  }
}

function parseFontFamilies($) {
  const families = new Set();

  $(`[class*="brz-ff-"]`).each(function() {
    const className = $(this).attr("class");
    const match = className.match(/brz-ff-([^\s]+)/);

    families.add(match[1]);
  });

  $("style").each(function() {
    const cssText = $(this).text();
    const r = /font-family:([^;]+);/g;
    let match;

    while ((match = r.exec(cssText))) {
      families.add(match[1].replace(/\s+|!\s*important/g, ""));
    }
  });

  return [...families];
}

function arrayToObject(arr, valueFill = true) {
  return arr.reduce((acc, item) => {
    acc[item] = valueFill;
    return acc;
  }, {});
}
