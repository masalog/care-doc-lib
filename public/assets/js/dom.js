/**
 * HTML要素のIDを指定して要素を取得する。
 *
 * document.getElementById() のショートハンドとして利用する。
 *
 * 使用例:
 * $("userName")
 * → document.getElementById("userName")
 *
 * @param {string} id 取得したいHTML要素のID
 * @returns {HTMLElement|null} 取得したHTML要素。存在しない場合は null
 */
export function $(id) {
  // 指定されたIDを持つHTML要素を取得して返す
  return document.getElementById(id);
}
