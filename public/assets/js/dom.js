/**
 * 共通のDOM参照ヘルパーを提供する。
 * @fileoverview アプリケーション画面で使うDOM参照ヘルパー。
 */

/**
 * IDから画面要素を取得する。
 * @param {string} id HTML要素のID
 * @returns {HTMLElement|null} 該当要素。存在しない場合はnull
 */
export const $ = (id) => document.getElementById(id);
