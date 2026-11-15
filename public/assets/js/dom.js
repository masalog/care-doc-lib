/**
 * 共通のDOM参照ヘルパー
 *
 * HTML要素を取得するときに使用する。
 * document.getElementById() を毎回書く代わりに、
 * 短く記述できるようにしている。
 *
 * 使用例
 * $("userName")
 * → document.getElementById("userName")
 *
 * $("saveButton")
 * → document.getElementById("saveButton")
 */
export function $(id) {
  // 指定されたIDを持つHTML要素を取得して返す
  return document.getElementById(id);
}
