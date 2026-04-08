import requests
from bs4 import BeautifulSoup
import json
import sys

def scrape_product(url):
    """
    Scrapes product information from a given URL.
    Extracts Title, Price, Image URL, and Description.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        return {"error": f"Connection error: {e}"}

    soup = BeautifulSoup(response.text, 'html.parser')
    
    # 1. Extract Title
    # Try OpenGraph, then meta title, then <title> tag
    title = soup.find("meta", property="og:title")
    if title:
        title = title.get("content")
    else:
        title = soup.find("title")
        title = title.get_text() if title else "N/A"
    
    # 2. Extract Image URL
    # Try OpenGraph image, then first large image
    image = soup.find("meta", property="og:image")
    if image:
        image = image.get("content")
    else:
        # Fallback: look for common product image containers
        img_tag = soup.find("img", {"id": "landingImage"}) or \
                  soup.find("img", {"class": "product-image"}) or \
                  soup.find("img", {"itemprop": "image"})
        image = img_tag.get("src") if img_tag else "N/A"
    
    # 3. Extract Description
    # Try OpenGraph description, then meta description
    description = soup.find("meta", property="og:description")
    if description:
        description = description.get("content")
    else:
        desc_tag = soup.find("meta", attrs={"name": "description"})
        description = desc_tag.get("content") if desc_tag else "N/A"
    
    # 4. Extract Price
    # Price is highly variable. We check common meta tags and schema.org
    price = soup.find("meta", property="og:price:amount") or \
            soup.find("meta", property="product:price:amount")
    
    if price:
        price_val = price.get("content")
        currency = soup.find("meta", property="og:price:currency")
        currency_val = currency.get("content") if currency else ""
        price = f"{currency_val} {price_val}".strip()
    else:
        # Fallback: Look for elements with 'price' in class or id
        price_tag = soup.find(attrs={"itemprop": "price"}) or \
                    soup.find(class_=lambda x: x and 'price' in x.lower()) or \
                    soup.find(id=lambda x: x and 'price' in x.lower())
        price = price_tag.get_text(strip=True) if price_tag else "N/A"

    return {
        "url": url,
        "title": title.strip() if title else "N/A",
        "price": price.strip() if price else "N/A",
        "image_url": image.strip() if image else "N/A",
        "description": description.strip() if description else "N/A"
    }

def main():
    print("=== Web Product Scraper ===")
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        url = input("Enter the product URL to scrape: ").strip()
    
    if not url.startswith("http"):
        print("Error: Please enter a valid URL starting with http:// or https://")
        return

    print(f"\nFetching data from: {url}...")
    result = scrape_product(url)
    
    print("\n" + "="*30)
    print("SCRAPED DATA")
    print("="*30)
    for key, value in result.items():
        print(f"{key.replace('_', ' ').title()}: {value}")
    print("="*30)

if __name__ == "__main__":
    main()
